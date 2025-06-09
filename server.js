const express = require("express");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
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
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

let handbookContent = "";

// 【変更箇所】workerSrcのパスを、インストールした古いバージョンに合わせる
pdfjsLib.GlobalWorkerOptions.workerSrc = `pdfjs-dist/legacy/build/pdf.worker.js`;

async function loadHandbook() {
  try {
    const dataBuffer = fs.readFileSync("./book.pdf"); // ← ファイル名はご自身のものに合わせてください
    const doc = await pdfjsLib.getDocument({
      data: new Uint8Array(dataBuffer),
      cMapUrl: "node_modules/pdfjs-dist/cmaps/", // CMapファイルの場所を指定
      cMapPacked: true, // パックされたCMapを使用する設定
    }).promise;
    const numPages = doc.numPages;
    let fullText = "";

    console.log(`PDFのページ数: ${numPages}`);

    for (let i = 1; i <= numPages; i++) {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => item.str).join(" ");
      fullText += `--- PAGE ${i} ---\n${pageText}\n\n`;
    }

    handbookContent = fullText;
    console.log(`学生便覧を ${numPages} ページ読み込みました`);
  } catch (error) {
    console.error("学生便覧の読み込みエラー:", error);
  }
}

// チャット API（変更なし）
app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "メッセージが必要です" });
    }

    const prompt = `
あなたは神戸大学工学部の学生便覧に詳しいチャットボットです。
以下の学生便覧の内容に基づいて、ユーザーの質問に回答してください。

# 学生便覧の内容
${handbookContent}
# 学生便覧の内容ここまで

# ユーザーの質問
${message}

# 回答のルール
- 上記の学生便覧の内容に基づいて、ユーザーの質問に回答してください。
- 回答する際は、該当する情報が記載されているページ番号を必ず含めてください（例：「○ページに記載されています」）。
- 学生便覧に記載されていない内容については、「学生便覧に記載されていません」と回答してください。
- 学生便覧の内容をもとに回答するときは、具体的なページ数を示してください。
- 回答は日本語で、分かりやすく説明してください。
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

// サーバー開始（変更なし）
app.listen(PORT, async () => {
  console.log(`サーバーがポート${PORT}で起動しました`);
  await loadHandbook();
});
