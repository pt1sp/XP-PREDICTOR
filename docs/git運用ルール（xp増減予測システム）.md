# Git運用ルール（XP増減予測システム）

本ドキュメントは、XP増減予測システム（React + TypeScript + Backend API）における
**実務に近いGit運用ルール**を定めたものです。

個人開発を前提としつつ、**チーム開発・現場運用でも通用すること**を目的としています。

---

## 1. 基本方針

- mainブランチは常に「動く状態」を保つ
- 作業は必ずブランチを切って行う
- コミット履歴は「あとから読めること」を重視する
- 小さく作って、小さくコミットする

---

## 2. ブランチ戦略

### 使用するブランチ

| ブランチ名 | 役割 |
|-----------|------|
| main | 安定版・提出/公開用 |
| develop | 開発統合ブランチ |
| feature/* | 機能追加 |
| fix/* | バグ修正 |
| refactor/* | リファクタリング |
| chore/* | 依存更新・設定変更 |

### 基本フロー

1. develop から作業ブランチを作成
2. 作業完了後、develop にマージ
3. まとまった単位で develop → main にマージ

---

## 3. ブランチ命名規則

- 英小文字＋ハイフン区切り
- 日本語は使用しない

### 例

- feature/ui-unify-inputs
- feature/weapon-picker-search
- fix/history-view-crash
- refactor/api-types
- chore/update-deps

---

## 4. コミットルール

### フォーマット

```
<type>(<scope>): 要約
```

### type 一覧

| type | 用途 |
|------|------|
| feat | 機能追加 |
| fix | バグ修正 |
| refactor | 挙動を変えない整理 |
| style | UI / CSS / 見た目 |
| docs | ドキュメント |
| test | テスト |
| chore | 雑務・設定 |

### scope（推奨）

- frontend / backend
- ui / api / db
- predict / record / history

### 例

- feat(record): 保存後にhistoryへ自動遷移
- style(ui): 入力欄とボタンの配色を統一
- fix(api): fetchSessions失敗時のエラー表示を改善
- refactor(backend): Prisma取得処理を分離
- docs(readme): 起動手順を追記

---

## 5. コミット粒度のルール

- 1コミット = 1目的
- UI変更とロジック変更を同じコミットにしない
- 迷ったら小さく分ける

---

## 6. マージ条件（Doneの定義）

以下を満たした場合に develop へマージ可とする。

- npm run build が通る
- 主要画面が手動確認できている
  - 予測画面
  - 記録保存
  - 履歴表示
- 秘密情報が含まれていない
- コミット履歴から変更内容が追える

---

## 7. Pull Request 運用

### PRに含める内容

- 目的（なぜこの変更をしたか）
- 変更点（何を変えたか）
- 動作確認方法
- スクリーンショット（UI変更時）

※ 個人開発でもPRを作ることで実務に近い運用とする

---

## 8. マージ方式

- develop へのマージは Squash Merge を推奨
- featureブランチでは自由にコミットしてよい
- main ブランチは履歴の読みやすさを重視

---

## 9. タグ・リリース管理

main にマージしたタイミングでタグを付与する。

### 例

- v0.1.0 初期動作版
- v0.2.0 UI統一完了
- v1.0.0 公開版

GitHub Releases に変更概要を記載する。

---

## 10. .gitignore 運用ルール

### コミットしないもの

- .env / .env.*
- node_modules/
- dist/ / build/
- DB実体ファイル（sqliteなど）
- *.log

### コミットするもの

- ソースコード
- Prisma schema / migrations
- README / ドキュメント

---

## 11. 1日の作業フロー（推奨）

1. develop を最新化
2. 作業ブランチ作成
3. 小さく実装・コミット
4. ビルド確認
5. PR作成
6. Squashして develop にマージ

---

## 12. 補足

本ルールは学習状況やプロジェクト成長に応じて更新する。
改善提案が出た場合は docs 更新を伴うこと。
