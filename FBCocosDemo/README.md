# FBCocosDemo 介绍
Build with Cocos Creator 2.2.0, and should be compatible with 2.x (not with 3.x)

本项目使用Cocos Creator 2.2.0编写，应该兼容Creator 2.x版本，不兼容Creator 3.x版本。

## Usage 使用方法
使用Facebook 小游戏方式打包，上传Facebook小游戏后台，然后测试。

### 广告参数
修改 assets/Script/FBApp.ts中的广告参数
```
const FB_ADS = {
    INTERSTITIAL: "4262010590525770_4272912656102230",   // 插屏
    REWARDED_VIDEO: "4262010590525770_4272913659435463", // 激励视频
    BANNER: "4262010590525770_4272911552769007",         // banner
}
```
