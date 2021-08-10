// fb文档 https://developers.facebook.com/docs/games/instant-games/sdk/fbinstant6.3
// 使用的话，直接看广告管理器 FBAdManager
/*
使用步骤
* 1. addXXXXAd() 添加相应的广告，以及预加载的数量（默认为3)
* 1.1. 插屏 addInterstitial
* 1.2. 激励视频 addRewardedVideo
* 1.3. banner addBanner

* 2. loadAll() 预加载所有广告实例

* 3. isXXXReady() 检查是否可以播放
* 3.1. 插屏  isInterstitialAdReady
* 3.2. 激励视频 isRewardedVideoReady
* 3.3. banner

* 4. showXXXAsync() 播放广告，并检查播放状态
* 4.1. 插屏 showInterstitialAd
* 4.2. 激励视频 showRewardedVideo
* 4.3. banner isBannerReady

* 5. hideXXXAsync() 隐藏广告（banner专属)
* 5.1. 插屏 不需要
* 5.2. 激励视频 不需要
* 5.3. banner hideBannerAsync

* 其他：
* 6. 判断是否支持特定api
* 6.1 判断是否支持banner广告
// 
*/

const FB_MAX_AD_INSTANCE = 3;   // FB允许的最多广告实例数量
const FB_INIT_AD_COUNT = 3;     // 预加载的广告实例数量

const FB_BANNER_REFRESH_INTERVAL = 30+10; // FB: Banner广告有播放间隔限制 30 seconds (由于网络原因，需要多加一点时间)
const FB_INTERSTITIAL_REFRESH_INTERVAL = 30+10; // FB: 插屏广告有播放间隔限制
const FB_REWARDED_VIDEO_REFRESH_INTERVAL = 0;   // FB: 激励视频没有播放间隔限制

const FB_MAX_BANNER_ERROR = 1;              // banner加载连续出现N次错误后，终止加载
const FB_MAX_INTERSTITIAL_ERROR = 3;        // 插屏加载连续出现N次错误后，终止加载
const FB_MAX_REWARDED_VIDEO_ERROR = 3;      // 激励视频加载连续出现N次错误后，终止加载

const FB_AUTO_LOAD_ON_PLAY = true;          // 插屏、激励视频是否在播放完毕后自动加载
const FB_AUTO_RELOAD_DELAY = 1;             // 自动重新加载时，延迟加载等待的时间

const FB_AD_DELAY_FOR_FIRST_BANNER = 0;         // 首个banner广告延迟N秒显示
const FB_AD_DELAY_FOR_FIRST_INTERSTITIAL = 30;  // 首个插屏广告需要延迟30秒播放（避免游戏前30秒就播放广告）
const FB_AD_DELAY_FOR_FIRST_REWARDED_VIDEO = 0; // 首个激励视频广告延迟N秒显示

enum FB_AD_TYPE{
    INTERSTITIAL = 0,
    REWARDED_VIDEO = 1,
    BANNER = 2
}

enum FB_AD_STATE{
    NONE,
    NEW,
    LOADING,
    LOADED,
    PLAYING
}

function getStateName(state:FB_AD_STATE){
    let str = "NONE";
    switch(state){
        case FB_AD_STATE.NEW:
            str = "NEW";
            break;
        case FB_AD_STATE.LOADING:
            str = "LOADING";
            break;
        case FB_AD_STATE.LOADED:
            str = "LOADED";
            break;
        case FB_AD_STATE.PLAYING:
            str = "PLAYING";
            break;
    }

    return str;
}

async function waitTimeSecond(timeoutSecond:number, callback?) {
    return new Promise<void>((resolve, reject)=>{
        setTimeout(()=>{
            if(callback){
                callback();
            }
            resolve();
        }, timeoutSecond * 1000);
    });
}

interface FB_ERROR{
    code: string;
    message: string;
}

const ErrorTooManyAdInstance:FB_ERROR = {
    code: "EXCEED_MAX_AD_INSTANCE",
    message: "广告对象不允许超过 " + FB_MAX_AD_INSTANCE
}

const ErrorNoReadyAdInstance:FB_ERROR = {
    code: "NO_READY_AD_INSTANCE",
    message: "没有加载完毕的广告，或者广告播放太频繁"
}

const ErrorNotReadyForLoad:FB_ERROR = {
    code: "NOT_READY_FOR_LOAD",
    message: "当前状态不允许再次加载"
}

const ErrorAdIsLoading:FB_ERROR = {
    code: "AD_IS_LOADING",
    message: "广告正在加载"
}

const ErrorNotReadyForPlay:FB_ERROR = {
    code: "NOT_READY_FOR_PLAYING",
    message: "没有可以播放的广告"
}

const ErrorAdIsPlaying:FB_ERROR = {
    code: "AD_IS_PLAYING",
    message: "广告正在播放"
}

const ErrorNoBannerAdInstance:FB_ERROR = {
    code: "NO_BANNER_AD",
    message: "没有添加Banner广告"
}

const ErrorApiNotSupport:FB_ERROR = {
    code: "API_NOT_SUPPORT",
    message: "广告接口不支持"
}

const ErrorTooFastShow:FB_ERROR = {
    code: "TOO_FAST_SHOW",
    message: "广告播放太频繁"
}

const ErrorNotPlaying:FB_ERROR = {
    code: "NOT_PLAYING",
    message: "广告没有播放"
}

const ErrorTooManyErrors:FB_ERROR = {
    code: "TOO_MANY_ERRORS",
    message: "太多错误, 停止操作"
}

const FB_API_BANNER = "loadBannerAdAsync";

const FB_ERROR_CODE_RATE_LIMITED = "RATE_LIMITED";
const FB_ERROR_CLIENT_UNSUPPORTED_OPERATION = "CLIENT_UNSUPPORTED_OPERATION";
const FB_ERROR_ADS_NO_FILL = "ADS_NO_FILL";

// state : NONE -> NEW -> LOADING -> LOADED -> SHOWING -> (SHOWED) NONE

interface FBAdOption{
    autoLoadOnPlay: boolean,
    maxLoadError: number,      // 最多失误多少次后不再加载    
}

interface AdTimerOption{
    refreshInterval: number,   // 播放间隔
    delayForFirstAd: number,   // 第一个广告延迟N秒播放（避免游戏前30秒就播放广告）
}

function getOption(opt:FBAdOption, key:string, defaultValue:any){
    if(opt && typeof(opt[key])!= "undefined") {
        return opt[key];
    }

    return defaultValue;
}

// 广告计时器
class AdTimer{
    protected _lastShowTime:number = 0;    // 上次显示时间
    protected _refreshInterval:number = 0;    // 刷新间隔, <=0 表示无限制

    constructor(interval:number, delay:number){
        this._refreshInterval = interval>0?interval:0;
        this._lastShowTime = 0;
        if(delay>0){
            this._lastShowTime = Date.now() + delay * 1000 - this._refreshInterval * 1000;
        }
    }

    public isReadyToRefresh(){
        return this.getNextRefreshInterval() <= 0;
    }

    public getNextRefreshInterval(){
        let refreshInterval = 0;

        if(this._refreshInterval>0 && this._lastShowTime > 0){
            let currentTime = Date.now();
            refreshInterval = this._refreshInterval - (currentTime - this._lastShowTime)/1000;
        }

        return refreshInterval;
    }

    public updateLastShowTime(){
        this._lastShowTime = Date.now();
    }
}

class FBAdUnitBase{
    protected _state:FB_AD_STATE;
    protected _adId:string;
    protected _type:FB_AD_TYPE;

    // protected _lastShowTime:number = 0;    // 上次显示时间
    // protected _refreshInterval:number = 0;    // 刷新间隔, <=0 表示无限制

    protected _maxLoadError:number = 0;
    protected _errorCounter:number = 0;
    protected _fatalError:boolean = false;

    protected _sharedTimer:AdTimer = null;

    constructor(id:string, type:FB_AD_TYPE, sharedTimer:AdTimer, opt?:FBAdOption){
        this._adId = id;
        this._state = FB_AD_STATE.NONE;
        this._type = type;
        this._sharedTimer = sharedTimer;

        this._fatalError = false;
        console.assert(!!sharedTimer, "sharedTimer is invalid", sharedTimer);

        // this._refreshInterval = getOption(opt, "refreshInterval", 0);
        this._maxLoadError = getOption(opt, "maxLoadError", 0);

        // const delayForFirstAd = getOption(opt, "delayForFirstAd", 0);
        // if(delayForFirstAd > 0) {
        //     this._lastShowTime = Date.now() + delayForFirstAd * 1000 - this._refreshInterval * 1000;
        // }else{
        //     this._lastShowTime = 0;
        // }
    }

    public getStateName(){
        return getStateName(this._state);
    }

    public getAdTypeName(){
        if(this._type == FB_AD_TYPE.INTERSTITIAL){
            return "插屏广告";
        }
        if(this._type == FB_AD_TYPE.REWARDED_VIDEO){
            return "激励视频广告";
        }
        if(this._type == FB_AD_TYPE.BANNER){
            return "Banner";
        }

        return "UNKNOWN";
    }

    public getInfo(){
        return `[${this.getAdTypeName()}:${this._adId}:${this.getStateName()}]`;
    }

    public isReadyToRefresh(){
        // return this.getNextRefreshInterval() <= 0;
        return this._sharedTimer.isReadyToRefresh();
    }

    public getNextRefreshInterval(){
        return this._sharedTimer.getNextRefreshInterval();
    }

    protected updateLastShowTime(){
        this._sharedTimer.updateLastShowTime();
    }

    protected increaseErrorCounter(){
        this._errorCounter++;
    }

    protected resetErrorCounter(){
        this._errorCounter = 0;
    }

    protected setFatalError(){
        this._fatalError = true;
    }

    public isErrorTooMany(){
        return this._fatalError || (this._maxLoadError>0 && this._errorCounter >= this._maxLoadError);
    }
}

// 有状态的广告对象
abstract class FBStatefulAdUnit extends FBAdUnitBase{
    private _adInstance:FBInstant.AdInstance;

    private _autoLoadOnPlay:boolean; // 播放完毕后是否立即自动加载
    
    constructor(id:string, type:number, sharedTimer:AdTimer, opt?:FBAdOption){
        super(id, type, sharedTimer, opt);
        this._adInstance = null;
        this._autoLoadOnPlay = getOption(opt, "autoLoadOnPlay", false);
    }

    protected abstract createAdInstanceAsync(adId:string):Promise<FBInstant.AdInstance>;

    // 预加载广告
    public async loadAsync(){
        // [1] 获取 AdInstance
        if(this._adInstance == null){
            if(this._state == FB_AD_STATE.NONE){
                // 只能创建一次
                this._state = FB_AD_STATE.NEW;

                console.log("获取广告对象: " + this.getInfo());

                this._adInstance = await this.createAdInstanceAsync(this._adId);
            }else{
                // 已经在创建对象了 （new-ing)
                console.log("当前状态未满足加载条件, 正在获取广告对象: " + this.getInfo());
                return;
            }
        }else{
            // 对象已经创建好
            // 可以进行预加载
        }

        // [2] 检查是否满足预加载条件
        if(this._state != FB_AD_STATE.NEW){
            // 只有 NEW 状态才能进行加载
            console.log("当前状态未满足加载条件: " + this.getInfo());
            if(this._state == FB_AD_STATE.LOADING){
                console.log("广告正在加载中，不要重复加载" + this.getInfo());
                throw ErrorAdIsLoading;
            }else{
                throw ErrorNotReadyForLoad;
            }
        }

        if(this.isErrorTooMany()){
            console.log("太多错误，停止加载: " + this.getInfo());
            throw ErrorTooManyErrors;
        }

        try{
            // [3] 加载广告
            // 设置为加载中
            this._state = FB_AD_STATE.LOADING;

            console.log("开始加载广告: " + this.getInfo());
            await this._adInstance.loadAsync();

            // [4] 成功加载
            this._state = FB_AD_STATE.LOADED;
            this.resetErrorCounter();

            console.log("广告加载成功: " + this.getInfo());
            return true;
        }catch(e){
            // [5] 加载失败
            // 异常能正常进入promise的catch分支

            // 加载失败，不需要重置 adInstance
            // this._adInstance = null;
            // 状态回退到加载前

            console.error("广告加载失败: " + this.getInfo(), e);
            if((e as FB_ERROR).code == FB_ERROR_ADS_NO_FILL){
                // 遇到 NOT FILL错误，就不能再继续加载了
                console.error("广告无法填充，不再继续请求: " + this.getInfo());
                this.setFatalError();
            }else{
                this.increaseErrorCounter();
                this._state = FB_AD_STATE.NEW;
    
                // [6] TODO: 加载失败，自动重新加载
                // TODO: 应该适当延迟               
                console.log("延迟" + FB_AUTO_RELOAD_DELAY + "秒后, 自动重新加载: " + this.getInfo());
                waitTimeSecond(FB_AUTO_RELOAD_DELAY, this.loadAsync.bind(this));
           }

            throw e;
        }
    }

    // 广告是否加载完毕
    public isReady(){
        return this._adInstance != null && this._state == FB_AD_STATE.LOADED;
    }

    // 播放广告
    public async showAsync(){
        // [1.1] 判断是否满足播放条件
        if(!this.isReady()){
            console.log("当前状态未满足播放条件: " + this.getInfo());
            if(this._state == FB_AD_STATE.PLAYING){
                throw ErrorAdIsPlaying;
            }else{
                throw ErrorNotReadyForPlay;
            }
        }
        
        // [1.2] 是否满足播放间隔
        if(!this.isReadyToRefresh()){
            console.log("播放太频繁，还需间隔" + this.getNextRefreshInterval() + " 秒: " + this.getInfo());
            throw ErrorTooFastShow;
        }

        try{
            // [2] 播放广告
            // 设置为播放中
            this._state = FB_AD_STATE.PLAYING;

            console.log("开始播放广告: " + this.getInfo());
            await this._adInstance.showAsync();

            console.log("播放广告完毕: " + this.getInfo());

            // [3] 播放完毕后重置广告对象
            this._adInstance = null;
            this._state = FB_AD_STATE.NONE;
            this.updateLastShowTime();

            // [4] 播完自动加载
            if(this._autoLoadOnPlay){
                // TODO: 应该适当延迟
                console.log("延迟" + FB_AUTO_RELOAD_DELAY + "秒后, 自动重新加载: " + this.getInfo());
                waitTimeSecond(FB_AUTO_RELOAD_DELAY, this.loadAsync.bind(this));
            }
            return true;
        }catch(e){
            // [5] 播放完毕后重置广告对象
            console.log("播放广告失败: " + this.getInfo(), e);
            if(e.code == FB_ERROR_CODE_RATE_LIMITED){
                // 播放太频繁，可忽略
                // 状态回退
                this._state = FB_AD_STATE.LOADED;
            }else{
                this._adInstance = null;
                this._state = FB_AD_STATE.NONE;
    
                // [6] 失败自动重新加载
                if(this._autoLoadOnPlay){
                    console.log("延迟" + FB_AUTO_RELOAD_DELAY + "秒后, 自动重新加载: " + this.getInfo());
                    waitTimeSecond(FB_AUTO_RELOAD_DELAY, this.loadAsync.bind(this));
                }    
            }

            throw e;
        }

        // return false;
    }
}

// 插屏广告
class FBInterstitialUnit extends FBStatefulAdUnit{
    constructor(id:string, sharedTimer:AdTimer, opt?:FBAdOption){
        super(id, FB_AD_TYPE.INTERSTITIAL, sharedTimer, opt);
    }

    protected async createAdInstanceAsync(adId: string){
        return await FBInstant.getInterstitialAdAsync(this._adId);
    }
}

// 激励视频广告
class FBRewardedVideoUnit extends FBStatefulAdUnit{
    constructor(id:string, sharedTimer:AdTimer, opt?:FBAdOption){
        super(id, FB_AD_TYPE.REWARDED_VIDEO, sharedTimer, opt);
    }

    protected async createAdInstanceAsync(adId: string){
        return await FBInstant.getRewardedVideoAsync(this._adId);
    }
}

// 横幅广告
class FBBannerUnit extends FBAdUnitBase{
    constructor(id:string, sharedTimer:AdTimer,opt?:FBAdOption){
        super(id, FB_AD_TYPE.BANNER, sharedTimer, opt);
    }

    // 显示Banner广告, 注意可以调用多次
    public async showAsync(){
        if(!this.isReadyToRefresh()){
            console.log("播放太频繁，还需间隔" + this.getNextRefreshInterval() + " 秒: " + this.getInfo());
            throw ErrorTooFastShow;
        }

        if(this.isErrorTooMany()){
            console.log("太多错误，停止加载: " + this.getInfo());
            throw ErrorTooManyErrors;
        }

        try{
            this._state = FB_AD_STATE.PLAYING;
            console.log("开始显示广告: " + this.getInfo());
            await FBInstant.loadBannerAdAsync(this._adId);
            console.log("显示广告成功: " + this.getInfo());

            // 更新刷新时间
            this.updateLastShowTime();
            this.resetErrorCounter();
        }catch(e){
            console.error("显示广告失败: " + this.getInfo(), e);
            if(e.code == FB_ERROR_CODE_RATE_LIMITED){
                // 播放太频繁，可忽略
                // 不用重置，保留
            }else if(e.code == FB_ERROR_ADS_NO_FILL){
                // 遇到 NOT FILL错误，就不能再继续加载了
                console.error("广告无法填充，不再继续请求: " + this.getInfo());
                this.setFatalError();
            }else{
                this.increaseErrorCounter();
            }
            
            throw e;
        }
    }

    public async hideAsync(){
        if(this._state != FB_AD_STATE.PLAYING){
            console.log("广告没有在播放中: " + this.getInfo());
            throw ErrorNotPlaying;
        }

        try{
            console.log("隐藏广告: " + this.getInfo());
            // TODO: 重复隐藏广告不会报错
            await FBInstant.hideBannerAdAsync();
            this._state = FB_AD_STATE.NONE;
        }catch(e){
            console.error("隐藏广告失败: " + this.getInfo(), e);
            
            // 隐藏失败不做任何操作
            // this._state = FB_AD_STATE.NONE;
            throw e;
        }
    }
}

export default class FBAdManager{
    public static getVersion(){
        return "1.0.1";
    }

    private static _interstitialAds:Array<FBStatefulAdUnit> = [];
    private static _rewardedVideos:Array<FBStatefulAdUnit> = [];
    private static _banners:Array<FBBannerUnit> = [];

    private static _interstitialTimer:AdTimer = null;
    private static _rewardedVideoTimer:AdTimer = null;
    private static _bannerTimer:AdTimer = null;

    private static _bannerSupport = undefined;

    // 插屏广告默认参数
    public static defaultInterstitialOption:FBAdOption = {
        autoLoadOnPlay: FB_AUTO_LOAD_ON_PLAY,
        maxLoadError: FB_MAX_INTERSTITIAL_ERROR,
    };

    // 激励视频默认参数
    public static defaultRewardedVideoOption:FBAdOption = {
        autoLoadOnPlay: FB_AUTO_LOAD_ON_PLAY,
        maxLoadError: FB_MAX_REWARDED_VIDEO_ERROR,
    };
    
    // banner默认参数
    public static defaultBannerOption:FBAdOption = {
        autoLoadOnPlay: FB_AUTO_LOAD_ON_PLAY, // banner不需要这个参数
        maxLoadError: FB_MAX_BANNER_ERROR,
    };

    // 插屏广告计时器默认参数
    public static defaultInterstitialTimerOption:AdTimerOption = {
        refreshInterval: FB_INTERSTITIAL_REFRESH_INTERVAL,
        delayForFirstAd: FB_AD_DELAY_FOR_FIRST_INTERSTITIAL
    };

    // 激励视频计时器默认参数
    public static defaultRewardedVideoTimerOption:AdTimerOption = {
        refreshInterval: FB_REWARDED_VIDEO_REFRESH_INTERVAL,
        delayForFirstAd: FB_AD_DELAY_FOR_FIRST_REWARDED_VIDEO
    };
    
    // banner计时器默认参数
    public static defaultBannerTimerOption:AdTimerOption = {
        refreshInterval: FB_BANNER_REFRESH_INTERVAL,
        delayForFirstAd: FB_AD_DELAY_FOR_FIRST_BANNER
    };

    // 1.1 添加插屏广告
    // 返回已经添加的插屏广告总数
    public static addInterstitial(id:string, count:number=FB_INIT_AD_COUNT){
        if(this._interstitialTimer == null){
            this._interstitialTimer = new AdTimer(this.defaultInterstitialTimerOption.refreshInterval, this.defaultInterstitialTimerOption.delayForFirstAd);
        }

        for(let i=0;i<count;i++){
            if(this._interstitialAds.length >= FB_MAX_AD_INSTANCE){
                console.log("添加插屏广告失败, 超出限制: " + this._interstitialAds.length, id);
                throw ErrorTooManyAdInstance;
            }
    
            let adUnit = new FBInterstitialUnit(id, this._interstitialTimer, this.defaultInterstitialOption);
    
            this._interstitialAds.push(adUnit);
            console.log("添加插屏广告: " + id, "count: " + this._interstitialAds.length);    
        }

        return this._interstitialAds.length;
    }

    // 1.2. 添加激励视频广告
    // 返回已经添加的激励视频总数
    public static addRewardedVideo(id:string, count:number=FB_INIT_AD_COUNT){
        if(this._rewardedVideoTimer == null){
            this._rewardedVideoTimer = new AdTimer(this.defaultRewardedVideoTimerOption.refreshInterval, this.defaultRewardedVideoTimerOption.delayForFirstAd);
        }

        for(let i=0;i<count;i++){
            if(this._rewardedVideos.length >= FB_MAX_AD_INSTANCE){
                console.log("添加激励视频广告失败, 超出限制: " + this._rewardedVideos.length, id);
                throw ErrorTooManyAdInstance;
            }
            
            let adUnit = new FBRewardedVideoUnit(id, this._rewardedVideoTimer, this.defaultRewardedVideoOption);
            this._rewardedVideos.push(adUnit);
            console.log("添加激励视频广告: " + id, "count: " + this._rewardedVideos.length);
        }

        return this._rewardedVideos.length;
    }

    // 1.3. 添加Banner广告
    public static addBanner(id:string){
        if(this._bannerTimer == null){
            this._bannerTimer = new AdTimer(this.defaultBannerTimerOption.refreshInterval, this.defaultBannerTimerOption.delayForFirstAd);
        }

        let adUnit = new FBBannerUnit(id, this._bannerTimer, this.defaultBannerOption);
        this._banners.push(adUnit);
        console.log("添加Banner广告: " + id, "count: " + this._banners.length);

        return adUnit;
    }

    // 2. 初始化和预加载
    // Deprecated 此方法用于保持兼容, 建议使用 loadAllAsync
    public static async loadAll(){
        console.log("初始化广告队列");
        return await this.loadAllAsync();
    }

    // 异步顺序预加载所有广告
    public static async loadAllAsync(){
        console.log("FBAdManager Version: " + this.getVersion());
        console.log("初始化广告队列");
        // 两次加载间间隔N秒
        for(let i=0;i<this._interstitialAds.length;i++){
            const adUnit = this._interstitialAds[i];
            if(i>0){
                await waitTimeSecond(0.1);
            }           
            adUnit.loadAsync();
        }
        for(let i=0;i<this._rewardedVideos.length;i++){
            const adUnit = this._rewardedVideos[i];
            if(i>0){
                await waitTimeSecond(0.1);
            }           
            adUnit.loadAsync();
        }
    }

    private static _isAdReady(type: FB_AD_TYPE){
        let adUnits = (type == FB_AD_TYPE.INTERSTITIAL)?this._interstitialAds:this._rewardedVideos;
        let isReady = false;
        for(let i=0;i<adUnits.length;i++){
            const adUnit = adUnits[i];
            if(adUnit.isReady() && adUnit.isReadyToRefresh()){
                isReady = true;
                break;
            }
        }

        return isReady;
    }

    private static _showAsync(type: FB_AD_TYPE){
        let adUnits = (type == FB_AD_TYPE.INTERSTITIAL)?this._interstitialAds:this._rewardedVideos;
        let readyUnit:FBStatefulAdUnit = null;

        for(let i=0;i<adUnits.length;i++){
            const adUnit = adUnits[i];
            if(adUnit.isReady() && adUnit.isReadyToRefresh()){
                readyUnit = adUnit;
                break;
            }
        }

        if(readyUnit != null){
            return readyUnit.showAsync();
        }

        throw ErrorNoReadyAdInstance;
    }

    private static _getAdTimer(type: FB_AD_TYPE){
        if(type == FB_AD_TYPE.INTERSTITIAL){
            return this._interstitialTimer;
        }
        if(type == FB_AD_TYPE.REWARDED_VIDEO){
            return this._rewardedVideoTimer;
        }
        return this._bannerTimer;
    }

    // 3.1. 判断是否可以播放插屏广告
    public static isInterstitialAdReady(){
        return this._isAdReady(FB_AD_TYPE.INTERSTITIAL);
    }

    // 4.1. 播放插屏广告
    public static async showInterstitialAd(){
        return await this._showAsync(FB_AD_TYPE.INTERSTITIAL);
    }

    // 3.2. 判断是否可以播放激励视频广告
    public static isRewardedVideoReady(){
        return this._isAdReady(FB_AD_TYPE.REWARDED_VIDEO);
    }

    // 4.2. 播放激励视频广告
    public static async showRewardedVideo(){
        return await this._showAsync(FB_AD_TYPE.REWARDED_VIDEO);
    }

    // 6. 检查是否支持对应API
    public static checkApiSupport(api:string){
        if(FBInstant.getSupportedAPIs().indexOf(api) >= 0){
            return true;
        }
        else{
            return false;
        }
    }

    // 6.1. 是否支持banner
    public static isBannerSupport(){
        if(typeof this._bannerSupport == "undefined"){
            this._bannerSupport = this.checkApiSupport(FB_API_BANNER);   
        }

        return this._bannerSupport;
    }

    // 3.3. banner广告是否可以刷新或者重新加载
    public static isBannerReady(){
        if(this._banners.length <= 0){
            throw ErrorNoBannerAdInstance;
        }

        let adUnit = this._banners[0];
        return adUnit.isReadyToRefresh();
    }

    // 4.3. 播放默认banner广告
    public static async showBannerAsync(){
        if(!this.isBannerSupport()){
            throw ErrorApiNotSupport;
        }

        if(this._banners.length <= 0){
            throw ErrorNoBannerAdInstance;
        }

        let adUnit = this._banners[0];
        return await adUnit.showAsync();
    }

    // 5.3. 隐藏默认banner广告
    public static async hideBannerAsync(){
        if(!this.isBannerSupport()){
            throw ErrorApiNotSupport;
        }

        if(this._banners.length <= 0){
            throw ErrorNoBannerAdInstance;
        }

        let adUnit = this._banners[0];
        return await adUnit.hideAsync();
    }
}