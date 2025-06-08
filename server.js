const express = require("express");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const pdf = require("pdf-parse");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// Gemini AI初期化
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

let handbookContent = "";

// 学生便覧のPDFを読み込み
async function loadHandbook() {
  try {
    const dataBuffer = fs.readFileSync("./book.pdf");

    // ページごとにテキストを抽出するためのオプション
    const options = {
      pagerender: (pageData) => {
        return pageData.getTextContent().then((textContent) => {
          let text = "";
          textContent.items.forEach((item) => {
            text += item.str + " ";
          });
          return `[ページ ${pageData.pageNumber}]\n${text}\n\n`;
        });
      },
    };

    const data = await pdf(dataBuffer, options);
    handbookContent = data.text;

    console.log(`学生便覧を読み込みました (総ページ数: ${data.numpages})`);
  } catch (error) {
    console.error("学生便覧の読み込みエラー:", error);
  }
}

// チャット API
app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "メッセージが必要です" });
    }

    // プロンプトを作成
    const prompt = `
以下は学生便覧の内容です（ページ番号付き）：
${handbookContent}

ユーザーの質問: ${message}

上記の学生便覧の内容に基づいて、ユーザーの質問に回答してください。
回答する際は、該当する情報が記載されているページ番号を必ず含めてください（例：「○ページに記載されています」）。
学生便覧に記載されていない内容については、「学生便覧に記載されていません」と回答してください。
回答は日本語で、分かりやすく説明してください。
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    res.json({ response: text });
  } catch (error) {
    console.error("チャットエラー:", error);
    res.status(500).json({ error: "サーバーエラーが発生しました" });
  }
});

// サーバー開始
app.listen(PORT, async () => {
  console.log(`サーバーがポート${PORT}で起動しました`);
  await loadHandbook();
});
