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

// ★ 変更点: handbookContentはJSONオブジェクトの配列を保持するようにします
let handbookContent = [];
const jsonHandbookPath = "./handbook.json"; // 生成するJSONファイルのパス
const pdfHandbookPath = "./kogakubu_2024.pdf";      // 元のPDFファイルのパス

// 【変更箇所】workerSrcのパスを、インストールした古いバージョンに合わせる
pdfjsLib.GlobalWorkerOptions.workerSrc = `pdfjs-dist/legacy/build/pdf.worker.js`;

// ★ 変更点: PDFを読み込んでJSONに変換、次回以降はJSONを直接読み込む関数
async function loadHandbook() {
  try {
    // まずJSONファイルが存在するか確認
    if (fs.existsSync(jsonHandbookPath)) {
      console.log(`${jsonHandbookPath} を読み込んでいます...`);
      const jsonData = fs.readFileSync(jsonHandbookPath, "utf-8");
      handbookContent = JSON.parse(jsonData);
      console.log(`学生便覧（JSON）を ${handbookContent.length} ページ分読み込みました`);
      return;
    }

    // JSONファイルがない場合、PDFから生成する
    console.log("PDFを読み込んでJSONファイルを生成します...");
    const dataBuffer = fs.readFileSync(pdfHandbookPath);
    const doc = await pdfjsLib.getDocument({
      data: new Uint8Array(dataBuffer),
      cMapUrl: "node_modules/pdfjs-dist/cmaps/", // CMapファイルの場所を指定
      cMapPacked: true, // パックされたCMapを使用する設定
    }).promise;
    const numPages = doc.numPages;
    const handbookData = []; // ページごとのデータを格納する配列

    console.log(`PDFのページ数: ${numPages}`);

    for (let i = 1; i <= numPages; i++) {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => item.str).join(" ");
      
      // ページ番号とテキストコンテンツをオブジェクトとして配列に追加
      handbookData.push({
        page: i,
        content: pageText,
      });
      console.log(`ページ ${i} を処理しました...`);
    }

    // 配列をJSON文字列に変換してファイルに保存
    fs.writeFileSync(jsonHandbookPath, JSON.stringify(handbookData, null, 2), "utf-8");
    console.log(`学生便覧データを ${jsonHandbookPath} として保存しました`);

    handbookContent = handbookData;

  } catch (error) {
    console.error("学生便覧の読み込みまたはJSON生成でエラーが発生しました:", error);
  }
}

// チャット API
app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "メッセージが必要です" });
    }

    // ★ 変更点: プロンプトにJSONデータを埋め込むように修正
    const prompt = `
あなたは神戸大学工学部の学生便覧に詳しいチャットボットです。
以下の学生便覧の内容（JSON形式）に基づいて、ユーザーの質問に回答してください。

# 学生便覧の内容 (JSON)
${JSON.stringify(handbookContent, null, 2)}
# 学生便覧の内容ここまで

# ユーザーの質問
${message}

# 回答のルール
- 上記の学生便覧の内容（JSON）に基づいて、ユーザーの質問に回答してください。
- 各JSONオブジェクトの "page" がページ番号、"content" がそのページの内容です。
- 回答する際は、該当する情報が記載されている "page" 番号を必ず含めてください（例：「○ページに記載されています」）。
- 同じことが書いてあるページが複数あれば、該当する情報が記載されている "page" 番号も必ず含めてください。
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

// サーバー開始
app.listen(PORT, async () => {
  console.log(`サーバーがポート${PORT}で起動しました`);
  await loadHandbook();
});