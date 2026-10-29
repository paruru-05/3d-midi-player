# 3D MIDI Player

MIDIファイルを読み込み、3D空間で演奏を可視化するブラウザベースのMIDIプレイヤーです。

**デモ:** https://paruru-05.github.io/3d-midi-player/

## 機能

- MIDIファイルのドラッグ＆ドロップ / ファイル選択
- 4つの可視化ビュー
  - Fall
  - PianoRoll 3D
  - TopDown
  - Keyboard 3D
- PianoRoll 3D / TopDownでは、曲の音域に合わせた3Dピアノ鍵盤を表示
- プレイヘッドでノートをクリップし、視点位置によるノートの貫通を防止
- 再生 / 一時停止 / 停止、シーク、再生速度、マスター音量
- トラックごとのミュート / ソロ / 音量調整
- ノートの色モード（トラック / チャンネル / ベロシティ / 音階）
- 左ドラッグによるカメラ回転、オートローテート
- 背景画像をプラネタリウム風の半球ドームに表示
  - 不透明度、半径、高さ、回転、スピンを調整可能
- カスタムSF2 / SF3サウンドフォントの読み込み

## 使い方

1. デモページを開きます。
2. 「ファイルを開く」からMIDIファイル（`.mid` / `.midi`）を選択するか、画面へドラッグ＆ドロップします。
3. ビューやパラメータを変更して再生します。

デフォルトのGM音源はCDNから読み込まれるため、初回再生時はインターネット接続が必要です。カスタムSF2 / SF3を読み込むと、ローカルの音源で再生できます。

## 開発

### 必要な環境

- Node.js 20.19以上（推奨: 22.12以上）
- npm

### セットアップ

```bash
npm install
```

### 開発サーバー

```bash
npm run dev
```

### 本番ビルド

```bash
npm run build
```

`dist/`に静的ファイルが出力されます。

### ビルドのプレビュー

```bash
npm run preview
```

## GitHub Pages

`main`ブランチへのpush時にGitHub Actionsが自動でビルドし、GitHub Pagesへデプロイします。

- ワークフロー: `.github/workflows/deploy.yml`
- 公開URL: https://paruru-05.github.io/3d-midi-player/

Viteの`base`は`./`に設定しているため、プロジェクトページ配下でもアセットを解決できます。

## 構成

```text
src/
  app/        アプリケーションUIと状態管理
  audio/      Web Audio / サンプラー
  midi/       MIDI読み込みとGM音源名
  playback/   再生トランスポート
  state/      型定義
  visual/     Three.jsシーン、ビュー、鍵盤、エフェクト
public/       ファビコン
index.html    アプリシェル
```

## 補足

- リポジトリにはMIDIファイルやサウンドフォントを含みません。
- `node_modules/`、`dist/`、ローカルのサウンドフォント（`.sf2` / `.sf3`）は`.gitignore`で除外しています。
- WebGLとWeb Audio APIに対応したモダンブラウザで利用してください。
