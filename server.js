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

// 学部・学科名とPDFファイルのパスをマッピング
const facultyData = {
  engineering: {
    name: "工学部",
    path: "./book_kougaku.pdf", // 工学部全体のPDF
    departments: {
      mechanical: "機械工学科",
      electrical: "電気電子工学科",
      computer_science: "情報知能工学科",
      applied_chemistry: "応用化学科",
      civil_engineering: "市民工学科",
      architecture: "建築学科",
    },
  },
  letters: {
    name: "文学部",
    path: "./book_bungaku.pdf", // 文学部全体のPDF（例）
    departments: {
      philosophy: "哲学・倫理学専修",
      history: "歴史学専修",
      literature: "文学専修",
      cultural_studies: "文化学専修",
    },
  },
  science: {
    name: "理学部",
    path: "./book_science.pdf", // 理学部全体のPDF（例）
    departments: {
      mathematics: "数学科",
      physics: "物理学科",
      chemistry: "化学科",
      biology: "生物学科",
      planetology: "惑星学科",
    },
  },
};

// 読み込んだPDFコンテンツをキャッシュするオブジェクト
const handbookCache = {};

pdfjsLib.GlobalWorkerOptions.workerSrc = `pdfjs-dist/legacy/build/pdf.worker.js`;

async function loadHandbook(faculty) {
  if (handbookCache[faculty]) {
    console.log(
      `${facultyData[faculty].name}の学生便覧をキャッシュから読み込みました`
    );
    return handbookCache[faculty];
  }

  const handbookInfo = facultyData[faculty];
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
    const { message, faculty, department } = req.body;

    if (!message || !faculty || !department) {
      return res
        .status(400)
        .json({ error: "メッセージ、学部、学科の指定が必要です" });
    }

    const facultyInfo = facultyData[faculty];
    if (!facultyInfo) {
      return res.status(400).json({ error: "指定された学部は存在しません" });
    }
    const departmentName = facultyInfo.departments[department];
    if (!departmentName) {
      return res.status(400).json({ error: "指定された学科は存在しません" });
    }

    const handbookContent = await loadHandbook(faculty);

    if (!handbookContent) {
      return res
        .status(500)
        .json({ error: "学生便覧の読み込みに失敗しました。" });
    }

    const facultyName = facultyInfo.name;

    const prompt = `
あなたは神戸大学${facultyName}の学生便覧に詳しいチャットボットです。
ユーザーは特に「${departmentName}」に関する情報を探しています。
以下の${facultyName}学生便覧の内容に基づいて、ユーザーの質問に回答してください。

# ${facultyName}学生便覧の内容
${handbookContent}
# ${facultyName}学生便覧の内容ここまで

# ユーザーの質問
${message}

# 回答のルール
- あなたの知識ではなく、上記の学生便覧の内容のみを情報源としてください。
- 回答は「${departmentName}」の学生に関連する内容を優先してください。
- 回答する際は、該当する情報が記載されているページ番号を必ず含めてください（例：「○ページに記載されています」）。
- 学生便覧に記載されていない内容については、「学生便覧に記載されていません」と明確に回答してください。
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
});

// === ▲▲▲ 変更箇所 ▲▲▲ ===
