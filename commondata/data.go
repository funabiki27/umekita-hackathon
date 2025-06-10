package commondata

// Faculty は学部情報を保持します
type Faculty struct {
	Name        string
	Path        string // PDFファイルのパス
	Departments map[string]Department
	PageOffset  int    // 内容上の1ページ目が、物理的に何ページ目から始まるかを指定
}

// Department は学科情報を保持します
type Department struct {
	Name string
}

// FacultyData は学部・学科の全データを保持するマップです
// PageOffsetの値は、実際のPDFに合わせて適宜修正してください。
var FacultyData = map[string]Faculty{
	"engineering": {
		Name:       "工学部",
		Path:       "../binran_all_pdf/kougaku_2024.pdf",
		PageOffset: 6, // 物理6ページ目から本文1ページ目が始まると仮定
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
		Name:       "文学部",
		Path:       "../binran_all_pdf/bungaku_2024.pdf",
		PageOffset: 17, // 物理17ページ目から本文1ページ目が始まると仮定
		Departments: map[string]Department{
			"philosophy":       {Name: "哲学・倫理学専修"},
			"history":          {Name: "歴史学専修"},
			"literature":       {Name: "文学専修"},
			"cultural_studies": {Name: "文化学専修"},
		},
	},
	"science": {
		Name:       "理学部",
		Path:       "../binran_all_pdf/rigaku_2024.pdf",
		PageOffset: 1, // 仮の値。要確認
		Departments: map[string]Department{
			"mathematics": {Name: "数学科"},
			"physics":     {Name: "物理学科"},
			"chemistry":   {Name: "化学科"},
			"biology":     {Name: "生物学科"},
			"planetology": {Name: "惑星学科"},
		},
	},
	"medicine": {
		Name:       "医学部",
		Path:       "../binran_all_pdf/hoken_2024.pdf",
		PageOffset: 8, // 物理8ページ目から本文1ページ目が始まると仮定
		Departments: map[string]Department{
			"nursing":              {Name: "看護学専攻"},
			"medical_technology":   {Name: "検査技術科学専攻"},
			"physical_therapy":     {Name: "理学療法学専攻"},
			"occupational_therapy": {Name: "作業療法学専攻"},
		},
	},
	"business_administration": {
		Name:       "経営学部",
		Path:       "../binran_all_pdf/keiei_2024.pdf",
		PageOffset: 9, // 物理9ページ目から本文1ページ目が始まると仮定
		Departments: map[string]Department{
			"business_administration": {Name: "経営学科"},
		},
	},
	"global_human_sciences": {
		Name:       "国際人間科学部",
		Path:       "../binran_all_pdf/kokusainingen_2024.pdf",
		PageOffset: 9, // 物理9ページ目から本文1ページ目が始まると仮定
		Departments: map[string]Department{
			"global_cultures":                  {Name: "グローバル文化学科"},
			"developed_community":              {Name: "発達コミュニティ学科"},
			"environment_and_sustainability": {Name: "環境共生学科"},
			"child_education":                  {Name: "子ども教育学科"},
		},
	},
	"agriculture": {
		Name:       "農学部",
		Path:       "../binran_all_pdf/nougaku_2024.pdf",
		PageOffset: 1, // 仮の値。要確認
		Departments: map[string]Department{
			"agro-environmental_science": {Name: "食料環境システム学科"},
			"bioresource_science":        {Name: "資源生命科学科"},
			"agrobioscience":             {Name: "生命機能科学科"},
		},
	},
	"maritime_sciences": {
		Name:       "海洋政策科学部",
		Path:       "../binran_all_pdf/kaiyo_2024.pdf",
		PageOffset: 9, // 物理9ページ目から本文1ページ目が始まると仮定
		Departments: map[string]Department{
			"maritime_sciences": {Name: "海洋政策科学科"},
		},
	},
}