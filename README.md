# 学生便覧チャットボット

学生便覧（PDF）の内容に基づいて質問に回答するチャットボットです。

## 機能

- 学生便覧のPDFファイルを自動読み込み
- Gemini AIを使用した自然言語での質問応答
- シンプルなWebチャットインターフェース

## セットアップ

1. 依存関係のインストール:
```bash
npm install
```

2. 環境変数の設定:
`.env`ファイルにGemini APIキーを設定してください：
```
GOOGLE_GENERATIVE_AI_API_KEY=your_api_key_here
```

3. 学生便覧PDFの配置:
`book.pdf`という名前で学生便覧のPDFファイルをプロジェクトルートに配置してください。

## 使用方法

1. サーバーの起動:
```bash
npm start
```

2. ブラウザで `http://localhost:3000` にアクセス

3. チャットインターフェースで学生便覧に関する質問を入力

## 技術スタック

- Node.js
- Express.js
- Gemini AI (Google Generative AI)
- PDF-Parse
- HTML/CSS/JavaScript (フロントエンド)