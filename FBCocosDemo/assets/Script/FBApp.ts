import FBAdManager from "./FBAdManager";

const {ccclass, property} = cc._decorator;

/*
Test
视频： 948648615913785_949878532457460
插屏： 948648615913785_949878459124134
banner： 948648615913785_949878362457477

Test02
视频： 4262010590525770_4272913659435463
插屏： 4262010590525770_4272912656102230
banner： 4262010590525770_4272911552769007

ColorUp
Interstitial 272188327036051_274461726808711
RewardedVideo 272188327036051_274461436808740
*/
const FB_ADS = {
    INTERSTITIAL: "4262010590525770_4272912656102230",
    REWARDED_VIDEO: "4262010590525770_4272913659435463",
    BANNER: "4262010590525770_4272911552769007",
}

@ccclass
export default class FBApp extends cc.Component {

    @property(cc.Label)
    label: cc.Label = null;

    @property(cc.Button)
    btnBuy: cc.Button = null;

    // LIFE-CYCLE CALLBACKS:

    // onLoad () {}

    productId:string = '';
    private _ready = false;

    start () {
        this.btnBuy.node.active = false;

        this.label.string = "广告测试步骤: " + 
`
1. 添加广告id
2. 加载
3. 检查状态
4. 播放
`        

    }

    initPayment(){
        this.checkPaymentAPI();
        let self = this;
        FBInstant.payments.onReady(function () {
            console.log('===> Payments Ready!');
            self.label.string = "FB Payment is ready!";

            console.log('===> query products...');
            FBInstant.payments.getCatalogAsync().then(function (catalog) {
                console.log('===> query products ready: ');
                console.log(catalog); // [{productID: '12345', ...}, ...]
                console.log('===========================');

                if(catalog.length>0){
                    self.productId = catalog[0].productID;                   
                    self.label.string = "Query Catalog Ready: " + catalog.length + ", " + self.productId;
                }else{
                    self.label.string = "Query Catalog Ready: " + catalog.length;
                }
            }).catch(function(e){
            console.error('===> query products error: ', e);
            });

            self._ready = true;
            self.btnBuy.node.active = true;

            console.log('===> checking purchases ...');
            FBInstant.payments.getPurchasesAsync().then(function (purchases) {
            console.log("===> purchases: ", purchases); // [{productID: '12345', ...}, ...]
            }).catch(function(e){
            console.error("===> checking purchases failed: ", e);
            });
        });                
    }

    checkPaymentAPI(){
        let apis = FBInstant.getSupportedAPIs();
        if(apis.indexOf("payments.purchaseAsync")>=0){
            console.log("===> Payment available");
            this.label.string = "Payment is available!";
            return true;
        }else{
            console.log("===> Apis: ", apis);
            console.warn("===> Payment not available!");
            this.label.string = "Payment is not available!";
            return false;
        }
    }

    // // update (dt) {}
    // public onInitFBIAP(){
        
    // }

    public onBuyProduct(){
        if(!this._ready){
            console.warn("===> Payment not ready");
            return;
        }

        console.log("===> Buy product: " + this.productId);
        this.label.string = "Buy product: " + this.productId;

        let self = this;
        FBInstant.payments.purchaseAsync({
            productID: this.productId,
            // developerPayload: 'foobar',
          }).then(function (purchase) {
              console.log("===> purchase done: ", purchase);
              self.label.string += " ==> Done";
            // console.log(purchase);
            // {productID: '12345', purchaseToken: '54321', developerPayload: 'foobar', ...}
          }).catch(function(e){
            console.warn("===> purchase failed: ", e);
            self.label.string += " ==> Failed!";
          });
    }

    public onLogEvent(){
        console.info("===> log event test");
        FBApp.logEvent("test", {random_value: Math.floor(Math.random() * 100)});
    }

    public static logEvent(eventName:string, param?:any){
        console.info("logging event: ", eventName, param);
        if(typeof(window["gtag"]) === "undefined"){
            console.warn("===> gtag not init");
            return;
        }

        const gtag = window["gtag"];
        gtag("event", eventName, param);
    }

    public addInterstitial(){
        FBAdManager.addInterstitial(FB_ADS.INTERSTITIAL);
    }

    public addRewardedVideo(){
        FBAdManager.addRewardedVideo(FB_ADS.REWARDED_VIDEO);
    }

    public initAds(){
        FBAdManager.loadAll();
    }

    public isInterstitialReady(){
        this.label.string = "插屏广告状态: " + FBAdManager.isInterstitialAdReady();
    }

    public showInterstitial(){
        this.label.string = "尝试播放插屏广告";
        FBAdManager.showInterstitialAd().then(()=>{
            this.label.string = "播放插屏广告: 成功";
        }).catch(e=>{
            this.label.string = "播放插屏广告: 失败，原因: " + e.message;
        });
    }

    public isRewardVideoReady(){
        this.label.string = "激励视频广告状态: " + FBAdManager.isInterstitialAdReady();
    }

    public showRewardVideo(){
        this.label.string = "尝试播放激励视频广告";
        FBAdManager.showRewardedVideo().then(()=>{
            this.label.string = "播放激励视频广告: 成功";
        }).catch(e=>{
            this.label.string = "播放激励视频广告: 失败，原因: " + e.message;
        });
    }

    public addBanner(){
        FBAdManager.addBanner(FB_ADS.BANNER);
    }

    public showBanner(){
        FBAdManager.showBannerAsync().then(()=>{
            this.label.string = "显示Banner广告: 成功";
        }).catch(e=>{
            this.label.string = "显示Banner广告: 失败，原因: " + e.message;
        });
    }

    public hideBanner(){
        FBAdManager.hideBannerAsync().then(()=>{
            this.label.string = "隐藏Banner广告: 成功";
        }).catch(e=>{
            this.label.string = "隐藏Banner广告: 失败，原因: " + e.message;
        });
    }
}
