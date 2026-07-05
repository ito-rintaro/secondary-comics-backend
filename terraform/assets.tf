# FE で使用する画像を格納する S3 バケット。
# バケット自体は非公開のままにし、配信は CloudFront + OAC 経由で行う。
# （S3 の URL を直接公開しないことで、キャッシュ/HTTPS/独自ドメイン化に対応しやすくする）

data "aws_caller_identity" "current" {}

# --- 画像格納バケット本体 ---
# バケット名はグローバル一意が必要なため、tfstate バケットと同様にアカウントIDを付与する。
resource "aws_s3_bucket" "assets" {
  bucket = "${var.project_name}-assets${local.name_suffix}-${data.aws_caller_identity.current.account_id}"
}

# 公開アクセスは全面ブロック（配信は CloudFront 経由のみ）。
resource "aws_s3_bucket_public_access_block" "assets" {
  bucket = aws_s3_bucket.assets.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# バージョニング（誤削除・上書きからの復旧用）。
resource "aws_s3_bucket_versioning" "assets" {
  bucket = aws_s3_bucket.assets.id
  versioning_configuration {
    status = "Enabled"
  }
}

# 保存時暗号化（SSE-S3）。
resource "aws_s3_bucket_server_side_encryption_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# FE から fetch / canvas で画像を扱う場合に備えた CORS。
resource "aws_s3_bucket_cors_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id

  cors_rule {
    allowed_methods = ["GET", "HEAD"]
    allowed_origins = var.allowed_origins
    allowed_headers = ["*"]
    max_age_seconds = 3600
  }

  # 画像アップロード（署名付き PUT）用。admin フロントのオリジンから
  # 直接 S3 へ PUT できるようにする。
  cors_rule {
    allowed_methods = ["PUT"]
    allowed_origins = concat(var.allowed_origins, [local.admin_web_origin])
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# --- CloudFront から S3 へアクセスするための OAC ---
resource "aws_cloudfront_origin_access_control" "assets" {
  name                              = "${var.project_name}-assets${local.name_suffix}"
  description                       = "OAC for FE assets bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# --- 画像配信用 CloudFront ディストリビューション ---
resource "aws_cloudfront_distribution" "assets" {
  enabled             = true
  comment             = "${var.project_name}-assets${local.name_suffix}"
  default_root_object = ""
  price_class         = "PriceClass_200" # 日本を含むアジア/北米/欧州。全世界配信が必要なら All に変更。

  origin {
    domain_name              = aws_s3_bucket.assets.bucket_regional_domain_name
    origin_id                = "assets-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.assets.id
  }

  default_cache_behavior {
    target_origin_id       = "assets-s3"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]

    # AWS マネージドの "CachingOptimized" ポリシー（静的アセット向け）。
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

# --- CloudFront(OAC) からのみ S3 を読めるようにするバケットポリシー ---
data "aws_iam_policy_document" "assets" {
  statement {
    sid       = "AllowCloudFrontServicePrincipalReadOnly"
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.assets.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.assets.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "assets" {
  bucket = aws_s3_bucket.assets.id
  policy = data.aws_iam_policy_document.assets.json
}
