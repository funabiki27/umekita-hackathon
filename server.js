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

// PDF.jsのワーカー設定
pdfjsLib.GlobalWorkerOptions.workerSrc = `node_modules/pdfjs-dist/legacy/build/pdf.worker.js`;

/**
 * 学部に対応する学生便覧PDFを読み込み、テキストに変換して返す関数
 * @param {string} faculty - 学部キー (e.g., "engineering")
 * @returns {Promise<string|null>} - PDFの全文テキスト、またはエラーの場合はnull
 */
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
      // ページ番号をテキストに含めることで、回答の際に参照しやすくなる
      fullText += `--- PAGE ${i} ---\n${pageText}\n\n`;
    }

    handbookCache[faculty] = fullText; // 変換後のテキストをキャッシュ
    console.log(
      `${handbookInfo.name}学生便覧を ${numPages} ページ読み込み、キャッシュしました`
    );
    return fullText;
  } catch (error) {
    console.error(`${handbookInfo.name}学生便覧の読み込みエラー:`, error);
    return null;
  }
}

/**
 * 全文テキストから、ユーザーの質問に関連する部分を抽出する関数
 * @param {string} content - 学生便覧の全文テキスト
 * @param {string} query - ユーザーからの質問
 * @returns {string} - 抽出された関連部分のテキスト
 */
function extractRelevantContent(content, query) {
  const maxLength = 100000; // APIに送る最大文字数。gemini-1.5-flashはコンテキストウィンドウが広いが、念のため制限
  const contextLines = 3; // 関連行の前後何行を含めるか

  if (!query) {
      // 質問がない場合は、コンテンツの先頭部分を返す
      return content.length > maxLength ? content.substring(0, maxLength) + "\n...(内容が長いため省略)" : content;
  }

  // クエリをキーワードに分割（助詞などを除外するため2文字以上）
  const queryKeywords = [...new Set(query.toLowerCase().split(/\s+/).filter(kw => kw.length > 1))];
  const lines = content.split('\n');
  const relevantLineNumbers = new Set();

  // キーワードが含まれる行とその前後の行番号を収集
  lines.forEach((line, i) => {
    const lowerLine = line.toLowerCase();
    const isRelevant = queryKeywords.some(keyword => lowerLine.includes(keyword));

    if (isRelevant) {
      for (let j = Math.max(0, i - contextLines); j <= Math.min(lines.length - 1, i + contextLines); j++) {
        relevantLineNumbers.add(j);
      }
    }
  });

  if (relevantLineNumbers.size === 0) {
      // 関連行が見つからない場合は、全文の先頭部分を返す
      console.log("関連キーワードが見つからなかったため、冒頭部分を使用します。");
      return content.length > maxLength ? content.substring(0, maxLength) + "\n...(内容が長いため省略)" : content;
  }

  // 収集した行番号を昇順にソートし、テキストを再構築
  let result = Array.from(relevantLineNumbers)
    .sort((a, b) => a - b)
    .map(lineNumber => lines[lineNumber])
    .join('\n');

  // 長すぎる場合は末尾をカット
  if (result.length > maxLength) {
    result = result.substring(0, maxLength) + "\n...(関連内容が長いため省略)";
  }

  console.log(`全文 ${content.length}文字から、関連部分 ${result.length}文字を抽出しました。`);
  return result;
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

    // 学部に対応するPDFを読み込む
    const handbookContent = await loadHandbook(faculty);

    if (!handbookContent) {
      return res
        .status(500)
        .json({ error: "学生便覧の読み込みに失敗しました。" });
    }

    const facultyName = facultyInfo.name;

    // ★★★ レート制限対策: 質問に関連する部分だけを抽出 ★★★
    const relevantContent = extractRelevantContent(handbookContent, message);

    const prompt = `あなたは神戸大学${facultyName}の学生便覧に詳しいチャットボットです。
ユーザーは特に「${departmentName}」に関する情報を探しています。
以下の${facultyName}学生便覧の関連内容に基づいて、ユーザーの質問に回答してください。

# ${facultyName}学生便覧の関連内容
${relevantContent}
# ${facultyName}学生便覧の関連内容 ここまで

# ユーザーの質問
${message}

# 回答のルール
- あなた自身の知識ではなく、上記の「${facultyName}学生便覧の関連内容」のみを情報源としてください。
- 回答は「${departmentName}」の学生に関連する内容を優先してください。
- 回答する際は、該当する情報が記載されているページ番号を必ず含めてください（例：「学生便覧のP.〇〇に記載されています」）。ページ番号は「--- PAGE X ---」という形式で記述されています。
- 学生便覧に記載されていない内容については、「ご質問の件について、学生便覧に関連する記載は見つかりませんでした。」と明確に回答してください。
- 回答は日本語で、丁寧かつ分かりやすく説明してください。
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    res.json({ response: text });
  } catch (error) {
    console.error("チャットエラー:", error);

    // レート制限エラー（429 Too Many Requests）の場合
    if (error.message.includes("429") || error.message.includes("quota")) {
      return res.status(429).json({
        error:
          "現在、AIへのリクエストが集中しています。大変申し訳ありませんが、1分ほど時間をおいてから再度お試しください。",
        // retryAfter: 60, // フロントエンドでこの秒数待機させる目安
      });
    }

    // その他のサーバーエラー
    res.status(500).json({ error: "サーバー内部で予期せぬエラーが発生しました。" });
  }
});

// サーバー開始
app.listen(PORT, () => {
  console.log(`サーバーがポート${PORT}で起動しました`);
  // サーバー起動時に、主要なPDFを予め読み込んでキャッシュしておくことも可能
  // loadHandbook('engineering'); // 例：工学部の便覧を事前ロード
});