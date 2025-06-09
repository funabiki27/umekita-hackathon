const fs = require("fs");
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");

// PDF.jsのワーカーを設定
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "node_modules/pdfjs-dist/legacy/build/pdf.worker.js";

async function extractPDFText() {
  try {
    console.log("PDFからテキストを抽出中...");

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

      // 進捗表示
      if (i % 50 === 0) {
        console.log(`処理済み: ${i}/${numPages} ページ`);
      }
    }

    console.log(`抽出されたテキスト長: ${fullText.length} 文字`);

    // テキストをファイルに保存
    fs.writeFileSync("./handbook.txt", fullText, "utf8");
    console.log("テキストをhandbook.txtに保存しました");

    // 最初の500文字を表示して確認
    console.log("\n最初の500文字:");
    console.log(fullText.substring(0, 500));
  } catch (error) {
    console.error("PDFの処理中にエラーが発生しました:", error);
  }
}

extractPDFText();
