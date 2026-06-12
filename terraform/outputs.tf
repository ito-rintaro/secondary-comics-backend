output "api_base_url" {
  description = "Base URL of the deployed HTTP API"
  value       = aws_apigatewayv2_stage.default.invoke_url
}

output "table_name" {
  description = "DynamoDB table name"
  value       = aws_dynamodb_table.comics.name
}

output "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  value       = aws_cognito_user_pool.main.id
}

output "cognito_client_id" {
  description = "Cognito App Client ID (USER_PASSWORD_AUTH に使う)"
  value       = aws_cognito_user_pool_client.main.id
}
