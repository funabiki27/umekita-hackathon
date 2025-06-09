package main

import (
	"bytes"
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/google/generative-ai-go/genai"
	"github.com/joho/godotenv"
	"google.golang.org/api/option"
)

// 学科情報を保持する構造体
type Department struct {
	Name string
}

// 学部情報を保持する構造体
type Faculty struct {
	Name        string
	Path        string
	Departments map[string]Department
}

// 学部・学科データの定義
var facultyData = map[string]Faculty{
	"engineering": {
		Name: "工学部",
		Path: "./binran_all/kougaku_2024.pdf",
		Departments: map[string]Department{
			"mechanical":        {Name: "機械工学科"},
			"electrical":        {Name: "電気電子工学科"},
			"computer_science":  {Name: "情報知能工学科"},
			"applied_chemistry": {Name: "応用化学科"},
			"civil_engineering": {Name: "市民工学科"},
			"architecture":      {Name: "建築学科"},
		},
	},
	"letters": {
		Name: "文学部",
		Path: "./binran_all/bungaku_2024.pdf",
		Departments: map[string]Department{
			"philosophy":       {Name: "哲学・倫理学専修"},
			"history":          {Name: "歴史学専修"},
			"literature":       {Name: "文学専修"},
			"cultural_studies": {Name: "文化学専修"},
		},
	},
	"science": {
		Name: "理学部",
		Path: "./book_science.pdf", // このパスは仮です。必要に応じて修正してください。
		Departments: map[string]Department{
			"mathematics": {Name: "数学科"},
			"physics":     {Name: "物理学科"},
			"chemistry":   {Name: "化学科"},
			"biology":     {Name: "生物学科"},
			"planetology": {Name: "惑星学科"},
		},
	},
	// === ▼▼▼ ここから追加 ▼▼▼ ===
	"medicine": {
		Name: "医学部",
		Path: "./binran_all/hoken_2024.pdf", // 仮のパス
		Departments: map[string]Department{
			"nursing":              {Name: "看護学専攻"},
			"medical_technology":   {Name: "検査技術科学専攻"},
			"physical_therapy":     {Name: "理学療法学専攻"},
			"occupational_therapy": {Name: "作業療法学専攻"},
		},
	},
	"business_administration": {
		Name: "経営学部",
		Path: "./binran_all/keiei_2024.pdf", // 仮のパス
		Departments: map[string]Department{
			"business_administration": {Name: "経営学科"},
		},
	},
	"global_human_sciences": {
		Name: "国際人間科学部",
		Path: "./binran_all/kokusainingen_2024.pdf", // 仮のパス
		Departments: map[string]Department{
			"global_cultures":      {Name: "グローバル文化学科"},
			"developed_community":  {Name: "発達コミュニティ学科"},
			"environment_and_sustainability": {Name: "環境共生学科"},
			"child_education":      {Name: "子ども教育学科"},
		},
	},
	"agriculture": {
		Name: "農学部",
		Path: "./binran_all/nougaku_2024.pdf", // 仮のパス
		Departments: map[string]Department{
			"agro-environmental_science": {Name: "食料環境システム学科"},
			"bioresource_science":        {Name: "資源生命科学科"},
			"agrobioscience":             {Name: "生命機能科学科"},
		},
	},
	"maritime_sciences": {
		Name: "海洋政策科学部",
		Path: "./binran_all/kaiyo_2024.pdf", // 仮のパス
		Departments: map[string]Department{
			"maritime_sciences": {Name: "海洋政策科学科"},
		},
	},
	// === ▲▲▲ ここまで追加 ▲▲▲ ===
}

// PDFコンテンツをキャッシュするオブジェクトと、それを保護するためのMutex
var (
	handbookCache = make(map[string]string)
	cacheMutex    = sync.RWMutex{}
)

// PDFからテキストを抽出する関数 (Popplerを使用する新バージョン)
func extractTextFromPDF(path string) (string, int, error) {
	// 1. `pdfinfo`コマンドで総ページ数を取得
	cmdInfo := exec.Command("pdfinfo", path)
	var outInfo bytes.Buffer
	cmdInfo.Stdout = &outInfo
	if err := cmdInfo.Run(); err != nil {
		log.Printf("pdfinfoの実行に失敗しました。Popplerはインストールされていますか？: %v", err)
		return "", 0, fmt.Errorf("pdfinfoの実行エラー: %w", err)
	}

	numPages := 0
	for _, line := range strings.Split(outInfo.String(), "\n") {
		if strings.HasPrefix(line, "Pages:") {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				p, err := strconv.Atoi(parts[1])
				if err == nil {
					numPages = p
					break
				}
			}
		}
	}

	if numPages == 0 {
		return "", 0, fmt.Errorf("PDFのページ数が取得できませんでした")
	}

	// 2. `pdftotext`コマンドでページごとにテキストを抽出
	var fullText strings.Builder
	for i := 1; i <= numPages; i++ {
		// -f: 開始ページ, -l: 終了ページ, 最後の"-": 標準出力へ書き出す
		cmdText := exec.Command("pdftotext", "-f", strconv.Itoa(i), "-l", strconv.Itoa(i), path, "-")
		var outText bytes.Buffer
		var errText bytes.Buffer
		cmdText.Stdout = &outText
		cmdText.Stderr = &errText

		err := cmdText.Run()
		if err != nil {
			// エラーが出ても処理を続行することが望ましい場合がある
			log.Printf("ページのテキスト抽出中にエラー (ページ %d): %v, Stderr: %s", i, err, errText.String())
		}

		pageContent := outText.String()
		fullText.WriteString(fmt.Sprintf("--- PAGE %d ---\n%s\n\n", i, pageContent))
	}

	return fullText.String(), numPages, nil
}

// 学生便覧を読み込む関数 (キャッシュ対応)
func loadHandbook(facultyKey string) (string, error) {
	// 1. メモリキャッシュをチェック (Read Lock)
	cacheMutex.RLock()
	content, found := handbookCache[facultyKey]
	cacheMutex.RUnlock()
	if found {
		log.Printf("%sの学生便覧をキャッシュから読み込みました\n", facultyData[facultyKey].Name)
		return content, nil
	}

	// Write Lock (これからファイル読み書きやキャッシュへの書き込みを行うため)
	cacheMutex.Lock()
	defer cacheMutex.Unlock()

	// ダブルチェック（他のゴルーチンが待っている間にキャッシュを書き込んだ可能性を考慮）
	content, found = handbookCache[facultyKey]
	if found {
		return content, nil
	}

	facultyInfo, ok := facultyData[facultyKey]
	if !ok {
		return "", fmt.Errorf("%sに対応する設定が見つかりません", facultyKey)
	}

	// 2. テキストファイルのパスを定義
	textFilePath := fmt.Sprintf("./handbook_%s.txt", facultyKey)

	// 3. テキストファイルが存在すれば、それを読み込んで返す
	if _, err := os.Stat(textFilePath); err == nil {
		log.Printf("保存済みのテキストファイル (%s) を読み込んでいます...\n", textFilePath)
		fileContent, err := os.ReadFile(textFilePath)
		if err != nil {
			return "", fmt.Errorf("テキストファイルの読み込みエラー: %w", err)
		}
		handbookContent := string(fileContent)
		handbookCache[facultyKey] = handbookContent // メモリにキャッシュ
		log.Printf("%s学生便覧テキストを読み込みました (%d 文字)\n", facultyInfo.Name, len(handbookContent))
		return handbookContent, nil
	}

	// 4. テキストファイルがなければ、PDFを読み込む
	pdfPath := facultyInfo.Path
	if _, err := os.Stat(pdfPath); os.IsNotExist(err) {
		return "", fmt.Errorf("%sに対応するPDFファイルが見つかりません: %s", facultyKey, pdfPath)
	}

	log.Printf("%sのPDF (%s) を解析しています...\n", facultyInfo.Name, pdfPath)
	fullText, numPages, err := extractTextFromPDF(pdfPath)
	if err != nil {
		return "", fmt.Errorf("%s学生便覧の読み込みエラー: %w", facultyInfo.Name, err)
	}
	log.Printf("%s学生便覧のページ数: %d\n", facultyInfo.Name, numPages)

	// 5. 解析したテキストをファイルに保存し、メモリにキャッシュ
	err = os.WriteFile(textFilePath, []byte(fullText), 0644)
	if err != nil {
		log.Printf("警告: テキストファイルの保存に失敗しました: %v\n", err)
	} else {
		log.Printf("%sのテキストを %s に保存しました。\n", facultyInfo.Name, textFilePath)
	}
	handbookCache[facultyKey] = fullText
	log.Printf("%s学生便覧を %d ページ読み込みました\n", facultyInfo.Name, numPages)

	return fullText, nil
}

// チャットAPIのハンドラ
func chatHandler(c *gin.Context) {
	// リクエストボディを定義
	var requestBody struct {
		Message    string `json:"message"`
		Faculty    string `json:"faculty"`
		Department string `json:"department"`
	}

	if err := c.ShouldBindJSON(&requestBody); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "リクエスト形式が正しくありません"})
		return
	}

	if requestBody.Message == "" || requestBody.Faculty == "" || requestBody.Department == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "メッセージ、学部、学科の指定が必要です"})
		return
	}

	facultyInfo, ok := facultyData[requestBody.Faculty]
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "指定された学部は存在しません"})
		return
	}
	departmentInfo, ok := facultyInfo.Departments[requestBody.Department]
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "指定された学科は存在しません"})
		return
	}

	// 学生便覧を読み込む
	handbookContent, err := loadHandbook(requestBody.Faculty)
	if err != nil {
		log.Printf("便覧読み込みエラー: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "学生便覧の読み込みに失敗しました。"})
		return
	}

	ctx := context.Background()
	// Geminiクライアントの初期化
	client, err := genai.NewClient(ctx, option.WithAPIKey(os.Getenv("GOOGLE_GENERATIVE_AI_API_KEY")))
	if err != nil {
		log.Printf("Geminiクライアント作成エラー: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "AIサービスの接続に失敗しました"})
		return
	}
	defer client.Close()

	model := client.GenerativeModel("gemini-1.5-flash")

	// プロンプトの組み立て
	prompt := fmt.Sprintf(`
あなたは神戸大学%sの学生便覧に詳しいチャットボットです。
ユーザーは特に「%s」に関する情報を探しています。
以下の%s学生便覧の内容に基づいて、ユーザーの質問に回答してください。

# %s学生便覧の内容
%s
# %s学生便覧の内容ここまで

# ユーザーの質問
%s

# 回答のルール
- あなたの知識ではなく、上記の学生便覧の内容のみを情報源としてください。
- 回答は「%s」の学生に関連する内容を優先してください。
- 回答する際は、該当する情報が記載されているページ番号を必ず含めてください（例：「○ページに記載されています」）。
- 学生便覧に記載されていない内容については、「学生便覧に記載されていません」と明確に回答してください。
- 回答は日本語で、分かりやすく説明してください。
`, facultyInfo.Name, departmentInfo.Name, facultyInfo.Name, facultyInfo.Name, handbookContent, facultyInfo.Name, requestBody.Message, departmentInfo.Name)

	resp, err := model.GenerateContent(ctx, genai.Text(prompt))
	if err != nil {
		// ここでエラー内容を判定して、レートリミットなどの詳細なエラーを返すことも可能
		log.Printf("Geminiコンテンツ生成エラー: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "AIからの応答取得に失敗しました"})
		return
	}

	// レスポンスからテキスト部分を抽出
	var responseText string
	if len(resp.Candidates) > 0 && resp.Candidates[0].Content != nil && len(resp.Candidates[0].Content.Parts) > 0 {
		if txt, ok := resp.Candidates[0].Content.Parts[0].(genai.Text); ok {
			responseText = string(txt)
		}
	}

	if responseText == "" {
		responseText = "AIから有効な回答を得られませんでした。"
	}

	c.JSON(http.StatusOK, gin.H{"response": responseText})
}

func main() {
	// .envファイルを読み込む
	if err := godotenv.Load(); err != nil {
		log.Println("警告: .envファイルが見つかりません")
	}

	// Ginルーターの初期化
	router := gin.Default()

	// CORS (Cross-Origin Resource Sharing) の設定
	// Next.jsの開発サーバー (localhost:3000) からのアクセスを許可する
	config := cors.DefaultConfig()
	config.AllowOrigins = []string{"http://localhost:3000"}
	config.AllowMethods = []string{"GET", "POST", "OPTIONS"}
	config.AllowHeaders = []string{"Origin", "Content-Type"}
	router.Use(cors.New(config))

	// APIルートの設定
	router.POST("/api/chat", chatHandler)

	// サーバーの起動
	port := "8080"
	log.Printf("サーバーがポート%sで起動します\n", port)
	if err := router.Run(":" + port); err != nil {
		log.Fatalf("サーバーの起動に失敗しました: %v", err)
	}
}
