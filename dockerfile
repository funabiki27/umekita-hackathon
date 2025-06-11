# ステージ1: ビルド環境
FROM golang:1.24-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

WORKDIR /app/backend
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /server main.go


# ステージ2: 本番環境
FROM alpine:latest

# アプリケーションの作業ディレクトリを作成
WORKDIR /app

# ★★★ 変更点1: 必要なテキストファイルをコピー ★★★
# ビルドステージから binran_all_text ディレクトリをコピーします
COPY --from=builder /app/binran_all_text /app/binran_all_text

# ★★★ 変更点2: バイナリを backend ディレクトリに配置 ★★★
# Goプログラム内の相対パス指定 (../) が正しく機能するように、
# 開発環境と似たディレクトリ構造を再現します
RUN mkdir backend
COPY --from=builder /server /app/backend/server

# ★★★ 変更点3: 実行ディレクトリを変更 ★★★
WORKDIR /app/backend

EXPOSE 8080

# コンテナが起動したときに実行されるコマンド
CMD ["./server", "8080"]