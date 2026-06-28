# Zip the built Lambda bundle (lambda/dist) at apply time.
# `npm run build`（esbuild）で dist/index.mjs を生成してから apply すること。
# scripts/deploy.ps1 はビルドを自動で実行する。
data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../lambda/dist"
  output_path = "${path.module}/build/lambda.zip"
}

resource "aws_iam_role" "lambda" {
  name = "${var.project_name}-lambda-role${local.name_suffix}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

# Lets the function write logs to CloudWatch.
resource "aws_iam_role_policy_attachment" "lambda_logs" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Lets the function access the single-table app store and the market-record table.
# market-record は一覧ソート用 GSI(byNew/byPrice) を Query するため、テーブル本体に
# 加えて配下のインデックス ARN("<table>/index/*") も許可する。
# BatchGetItem は Collection/Market 一覧時に参照 productId 群の Product マスタを
# app テーブルから一括取得（サーバ側 join）するために必要。
resource "aws_iam_role_policy" "dynamodb" {
  name = "${var.project_name}-dynamodb-access${local.name_suffix}"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:GetItem",
        "dynamodb:BatchGetItem",
        "dynamodb:PutItem",
        "dynamodb:DeleteItem",
        "dynamodb:UpdateItem",
        "dynamodb:Scan",
        "dynamodb:Query",
      ]
      Resource = [
        aws_dynamodb_table.app.arn,
        aws_dynamodb_table.market_record.arn,
        "${aws_dynamodb_table.market_record.arn}/index/*",
      ]
    }]
  })
}

resource "aws_lambda_function" "api" {
  function_name    = "${var.project_name}-api${local.name_suffix}"
  role             = aws_iam_role.lambda.arn
  runtime          = "nodejs22.x"
  handler          = "index.handler"
  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  timeout          = 10

  environment {
    variables = {
      APP_TABLE_NAME    = aws_dynamodb_table.app.name
      MARKET_TABLE_NAME = aws_dynamodb_table.market_record.name
    }
  }

  # workspace が dev / prod 以外（例: default）のままデプロイされるのを防ぐ。
  lifecycle {
    precondition {
      condition     = contains(["dev", "prod"], local.environment)
      error_message = "workspace を dev か prod に切り替えてください: terraform workspace select dev|prod"
    }
  }
}

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${aws_lambda_function.api.function_name}"
  retention_in_days = 7
}
