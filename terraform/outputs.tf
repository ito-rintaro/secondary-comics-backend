output "api_base_url" {
  description = "Base URL of the deployed HTTP API"
  value       = aws_apigatewayv2_stage.default.invoke_url
}

output "table_name" {
  description = "DynamoDB table name"
  value       = aws_dynamodb_table.comics.name
}
