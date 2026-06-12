resource "aws_dynamodb_table" "comics" {
  name         = "${var.project_name}-comics${local.name_suffix}"
  billing_mode = "PAY_PER_REQUEST" # on-demand: no fixed cost, pay per request
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }
}
