output "environment" {
  description = "デプロイ先の環境（workspace 名）"
  value       = local.environment
}

output "api_base_url" {
  description = "Base URL of the deployed HTTP API"
  value       = aws_apigatewayv2_stage.default.invoke_url
}

output "market_record_table_name" {
  description = "MarketRecord table name"
  value       = aws_dynamodb_table.market_record.name
}

output "app_table_name" {
  description = "Single table for User / Collection / Price"
  value       = aws_dynamodb_table.app.name
}

output "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  value       = aws_cognito_user_pool.main.id
}

output "cognito_client_id" {
  description = "Cognito App Client ID (USER_PASSWORD_AUTH に使う)"
  value       = aws_cognito_user_pool_client.main.id
}

output "assets_bucket_name" {
  description = "FE 画像格納用 S3 バケット名（アップロード先）"
  value       = aws_s3_bucket.assets.bucket
}

output "assets_cdn_domain" {
  description = "画像配信用 CloudFront ドメイン（FE はこのドメインで画像を参照する）"
  value       = aws_cloudfront_distribution.assets.domain_name
}
