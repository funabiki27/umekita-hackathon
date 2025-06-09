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

// === ▼▼▼ 変更箇所 ▼▼▼ ===

// 学部名とPDFファイルのパスをマッピング
const handbookPaths = {
  engineering: { name: "工学部", path: "./book_kougaku.pdf" }, // 元のファイル
  letters: { name: "文学部", path: "./book_bungaku.pdf" }, // 文学部用のPDFパス（例）
  science: { name: "理学部", path: "./book_science.pdf" }, // 理学部用のPDFパス（例）
};

// 読み込んだPDFコンテンツをキャッシュするオブジェクト
const handbookCache = {};

pdfjsLib.GlobalWorkerOptions.workerSrc = `pdfjs-dist/legacy/build/pdf.worker.js`;

/**
 * 学部を指定して学生便覧のPDFを読み込み、テキストコンテンツを返す関数
 * @param {string} faculty - 学部キー (例: 'engineering')
 * @returns {Promise<string|null>} PDFのテキストコンテンツ、またはエラー時にnull
 */
async function loadHandbook(faculty) {
  // キャッシュがあればそれを返す
  if (handbookCache[faculty]) {
    console.log(
      `${handbookPaths[faculty].name}の学生便覧をキャッシュから読み込みました`
    );
    return handbookCache[faculty];
  }

  const handbookInfo = handbookPaths[faculty];
  if (!handbookInfo || !fs.existsSync(handbookInfo.path)) {
    console.error(
      `${faculty}に対応する学生便覧ファイルが見つかりません: ${handbookInfo?.path}`
    );
    return null;
  }

  try {
    const dataBuffer = fs.readFileSync(handbookInfo.path);
    const doc = await pdfjsLib.getDocument({
      data: new Uint8Array(dataBuffer),
      cMapUrl: "node_modules/pdfjs-dist/cmaps/",
      cMapPacked: true,
    }).promise;
    const numPages = doc.numPages;
    let fullText = "";

    console.log(`${handbookInfo.name}学生便覧のページ数: ${numPages}`);

    for (let i = 1; i <= numPages; i++) {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => item.str).join(" ");
      fullText += `--- PAGE ${i} ---\n${pageText}\n\n`;
    }

    // 読み込んだコンテンツをキャッシュに保存
    handbookCache[faculty] = fullText;
    console.log(
      `${handbookInfo.name}学生便覧を ${numPages} ページ読み込みました`
    );
    return fullText;
  } catch (error) {
    console.error(`${handbookInfo.name}学生便覧の読み込みエラー:`, error);
    return null;
  }
}

// チャット API
app.post("/api/chat", async (req, res) => {
  try {
    // リクエストボディから message と faculty を受け取る
    const { message, faculty } = req.body;

    if (!message || !faculty) {
      return res.status(400).json({ error: "メッセージと学部指定が必要です" });
    }

    if (!handbookPaths[faculty]) {
      return res.status(400).json({ error: "指定された学部は存在しません" });
    }

    // 指定された学部の学生便覧を読み込む
    const handbookContent = await loadHandbook(faculty);

    if (!handbookContent) {
      return res
        .status(500)
        .json({ error: "学生便覧の読み込みに失敗しました。" });
    }

    const facultyName = handbookPaths[faculty].name;

    const prompt = `
あなたは神戸大学${facultyName}の学生便覧に詳しいチャットボットです。
以下の${facultyName}学生便覧の内容に基づいて、ユーザーの質問に回答してください。

# ${facultyName}学生便覧の内容
${handbookContent}
# ${facultyName}学生便覧の内容ここまで

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

// サーバー開始
app.listen(PORT, () => {
  console.log(`サーバーがポート${PORT}で起動しました`);
  // サーバー起動時の事前読み込みは削除
});

// === ▲▲▲ 変更箇所 ▲▲▲ ===
