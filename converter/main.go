// converter/main.go
package main

import (
	"chatbot-backend/commondata"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
)

// 定数として出力ディレクトリを定義
const (
	textDir = "../binran_all_text"
)

// convertPdfToText は、オフセットを考慮してページ番号を付けます
func convertPdfToText(pdfPath string, textPath string, pageOffset int, wg *sync.WaitGroup) {
	defer wg.Done()

	if _, err := os.Stat(textPath); err == nil {
		log.Printf("スキップ（出力済み）: %s\n", textPath)
		return
	}

	if _, err := os.Stat(pdfPath); os.IsNotExist(err) {
		log.Printf("警告: 入力PDFが見つかりません: %s\n", pdfPath)
		return
	}

	log.Printf("変換開始: %s -> %s (オフセット: %d)\n", pdfPath, textPath, pageOffset)

	// 1. 総ページ数を取得
	cmdInfo := exec.Command("pdfinfo", pdfPath)
	outInfo, err := cmdInfo.Output()
	if err != nil {
		log.Printf("pdfinfoの実行エラー: %s, %v", pdfPath, err)
		return
	}
	numPages := 0
	for _, line := range strings.Split(string(outInfo), "\n") {
		if strings.HasPrefix(line, "Pages:") {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				if p, err := strconv.Atoi(parts[1]); err == nil {
					numPages = p
					break
				}
			}
		}
	}
	if numPages == 0 {
		log.Printf("ページ数が取得できませんでした: %s", pdfPath)
		return
	}

	// 2. ページごとにテキストを抽出し、オフセットを考慮したページ番号を付ける
	var fullText strings.Builder
	for i := 1; i <= numPages; i++ {
		cmdText := exec.Command("pdftotext", "-f", strconv.Itoa(i), "-l", strconv.Itoa(i), "-layout", pdfPath, "-")
		pageContent, err := cmdText.Output()
		if err != nil {
			log.Printf("ページ抽出エラー (物理ページ %d): %s, %v", i, pdfPath, err)
		}

		var pageLabel string
		// ★★★ オフセットを元にページ番号を計算 ★★★
		if i >= pageOffset {
			// オフセット以降のページは、計算した論理ページ番号を付ける
			logicalPageNumber := i - pageOffset + 1
			pageLabel = fmt.Sprintf("--- PAGE %d ---", logicalPageNumber)
		} else {
			// オフセットより前のページは、特別なラベルを付ける
			pageLabel = fmt.Sprintf("--- PAGE %d (表紙/目次など) ---", i)
		}

		fullText.WriteString(fmt.Sprintf("%s\n%s\n\n", pageLabel, string(pageContent)))
	}

	// 3. ファイルに書き込む
	err = os.WriteFile(textPath, []byte(fullText.String()), 0644)
	if err != nil {
		log.Printf("ファイル書き込みエラー: %s, %v", textPath, err)
		return
	}

	log.Printf("変換成功: %s (%dページ)\n", textPath, numPages)
}

func main() {
	log.Println("PDFからテキストへの一括変換処理を開始します...")

	if err := os.MkdirAll(textDir, 0755); err != nil {
		log.Fatalf("出力ディレクトリの作成に失敗しました: %v", err)
	}

	var wg sync.WaitGroup

	for facultyKey, facultyInfo := range commondata.FacultyData {
		pdfPath := facultyInfo.Path
		txtFileName := fmt.Sprintf("handbook_%s.txt", facultyKey)
		txtPath := filepath.Join(textDir, txtFileName)

		// ★★★ pageOffsetを関数に渡すように変更 ★★★
		wg.Add(1)
		go convertPdfToText(pdfPath, txtPath, facultyInfo.PageOffset, &wg)
	}

	wg.Wait()
	log.Printf("完了！合計 %d 個の学部の処理を試みました。\n", len(commondata.FacultyData))
}
