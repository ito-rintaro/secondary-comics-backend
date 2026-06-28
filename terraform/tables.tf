# データモデルのテーブル群。

# --- MarketRecord: 相場の共有マスタ（PK=marketRecordId）。一覧ソート用 GSI を持つため独立テーブル ---
resource "aws_dynamodb_table" "market_record" {
  name         = "${var.project_name}-market-record${local.name_suffix}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "marketRecordId"

  attribute {
    name = "marketRecordId"
    type = "S"
  }
  # GSI 用：全件を1つの束にまとめる固定値（"RECORD"）。
  attribute {
    name = "gsiPk"
    type = "S"
  }
  attribute {
    name = "listedAt"
    type = "N"
  }
  attribute {
    name = "price"
    type = "N"
  }

  # 新着順（gsiPk="RECORD" を listedAt で並べる）
  global_secondary_index {
    name            = "byNew"
    hash_key        = "gsiPk"
    range_key       = "listedAt"
    projection_type = "ALL"
  }

  # 価格順（gsiPk="RECORD" を price で並べる）
  global_secondary_index {
    name            = "byPrice"
    hash_key        = "gsiPk"
    range_key       = "price"
    projection_type = "ALL"
  }
}

# --- app: 単一テーブル設計。Catalog / Collection をまとめて管理 ---
# 汎用キー(PK/SK)に型プレフィックスを付けて1テーブルに同居させる。
#   Catalog    : PK="CATALOG"(固定)    SK="CATALOG#<id>"     （書誌マスタ＝型。PK で全件 Query 可。Collection/Market が catalogId で参照）
#   Collection : PK="USER#<userId>"   SK="COLLECTION#<itemId>"  （所有品。USER# パーティション配下）
resource "aws_dynamodb_table" "app" {
  name         = "${var.project_name}-app${local.name_suffix}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }
  attribute {
    name = "SK"
    type = "S"
  }
}
