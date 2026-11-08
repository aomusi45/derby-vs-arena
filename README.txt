DERBY VS ARENA V5 - 安全な出走登録の実装段階

内容:
- index.html: V4のデザイン維持、JSON検査、匿名認証、Callable Functionへの登録送信
- functions/index.js: 1人1頭、先着18頭、開始1分前締切をFirestoreトランザクションで管理
- firestore.rules: 公開読み取りのみ。entriesとmetaはクライアントから非公開

重要: このファイルは未デプロイ。Firebaseコンソールで匿名認証の有効化が必要。
Cloud FunctionsのデプロイにはFirebase Blazeプラン（従量課金）が必要な場合があります。
App Check強制を有効にしているため、App CheckのWeb登録と初期化も必要です。
これらを設定するまでは登録機能は動作しません。公開・課金設定はユーザーの確認後に行うこと。
自動開催・COM補充・G1カレンダー・レースエンジン・ライブ観戦は未実装。
この版をGitHubへ差し替えないでください。
