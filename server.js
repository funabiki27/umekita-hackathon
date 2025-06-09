const express = require("express");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 8080;

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
    // まずテキストファイルが存在するかチェック
    const textFilePath = "./handbook.txt";
    
    if (fs.existsSync(textFilePath)) {
      // テキストファイルが存在する場合は読み込み
      console.log("保存済みのテキストファイルを読み込んでいます...");
      handbookContent = fs.readFileSync(textFilePath, "utf8");
      console.log(`学生便覧テキストを読み込みました (${handbookContent.length} 文字)`);
      return;
    }

    // テキストファイルが存在しない場合はPDFから読み込み
    console.log("PDFからテキストを抽出しています...");
    const dataBuffer = fs.readFileSync("./book.pdf");
    const doc = await pdfjsLib.getDocument({
      data: new Uint8Array(dataBuffer),
      cMapUrl: "node_modules/pdfjs-dist/cmaps/",
      cMapPacked: true,
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
    
    // テキストファイルに保存
    fs.writeFileSync(textFilePath, fullText, "utf8");
    console.log(`学生便覧を ${numPages} ページ読み込み、handbook.txtに保存しました`);
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

    // テスト用：レート制限対策を一時的に無効化して全文を使用
    // const relevantContent = extractRelevantContent(handbookContent, message);
    const relevantContent = handbookContent;

    const prompt = `
あなたは神戸大学工学部の学生便覧に詳しいチャットボットです。
以下の学生便覧の関連内容に基づいて、ユーザーの質問に回答してください。

# 学生便覧の関連内容
${relevantContent}
# 学生便覧の関連内容ここまで

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
    
    // レート制限エラーの場合
    if (error.message.includes("429") || error.message.includes("quota")) {
      return res.status(429).json({ 
        error: "現在、AIサービスの利用制限に達しています。しばらく時間をおいてから再度お試しください。",
        retryAfter: 60 // 60秒後に再試行
      });
    }
    
    res.status(500).json({ error: "サーバーエラーが発生しました" });
  }
});

// 関連コンテンツ抽出関数
function extractRelevantContent(content, query) {
  const maxLength = 50000; // 約5万文字に制限
  
  // クエリに関連するキーワードで検索
  const queryKeywords = query.toLowerCase().split(/\s+/);
  const lines = content.split('\n');
  const relevantLines = [];
  
  // キーワードが含まれる行とその前後の行を抽出
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    const isRelevant = queryKeywords.some(keyword => 
      keyword.length > 1 && line.includes(keyword)
    );
    
    if (isRelevant) {
      // 前後3行も含める
      const start = Math.max(0, i - 3);
      const end = Math.min(lines.length, i + 4);
      for (let j = start; j < end; j++) {
        if (!relevantLines.includes(j)) {
          relevantLines.push(j);
        }
      }
    }
  }
  
  // 関連する行を結合
  let result = relevantLines
    .sort((a, b) => a - b)
    .map(i => lines[i])
    .join('\n');
  
  // 長さ制限
  if (result.length > maxLength) {
    result = result.substring(0, maxLength) + '\n...(内容が長いため省略)';
  }
  
  // 関連コンテンツが少ない場合は、冒頭部分も含める
  if (result.length < 10000) {
    const beginning = content.substring(0, maxLength - result.length);
    result = beginning + '\n\n=== 関連部分 ===\n' + result;
  }
  
  return result;
}

// サーバー開始（変更なし）
app.listen(PORT, async () => {
  console.log(`サーバーがポート${PORT}で起動しました`);
  await loadHandbook();
});
