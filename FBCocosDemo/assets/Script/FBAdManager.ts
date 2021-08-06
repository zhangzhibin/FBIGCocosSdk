// fb文档 https://developers.facebook.com/docs/games/instant-games/sdk/fbinstant6.3

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

const FB_MAX_AD_INSTANCE = 3;

const FB_BANNER_REFRESH_INTERVAL = 30+10; // FB: Banner广告有播放间隔限制 30 seconds (由于网络原因，需要多加一点时间)
const FB_INTERSTITIAL_REFRESH_INTERVAL = 30+10; // FB: 插屏广告有播放间隔限制
const FB_REWARDED_VIDEO_REFRESH_INTERVAL = 0;   // FB: 激励视频没有播放间隔限制

const FB_MAX_BANNER_ERROR = 1;
const FB_MAX_INTERSTITIAL_ERROR = 3;
const FB_MAX_REWARDED_VIDEO_ERROR = 3;

const FB_AUTO_LOAD_ON_PLAY = true;

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
    message: "没有加载完毕的广告"
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
    message: "广告播放速度过快, 需间隔: " + FB_BANNER_REFRESH_INTERVAL + " 秒"
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
    refreshInterval: number,
    autoLoadOnPlay: boolean,
    maxLoadError: number,      // 最多失误多少次后不再加载    
}

function getOption(opt:FBAdOption, key:string, defaultValue:any){
    if(opt && typeof(opt[key])!= "undefined") {
        return opt[key];
    }

    return defaultValue;
}

class FBAdUnitBase{
    protected _state:FB_AD_STATE;
    protected _adId:string;
    protected _type:FB_AD_TYPE;

    protected _lastShowTime:number = 0;    // 上次显示时间
    protected _refreshInterval:number = 0;    // 刷新间隔, <=0 表示无限制

    protected _maxLoadError:number = 0;
    protected _errorCounter:number = 0;

    constructor(id:string, type:FB_AD_TYPE, opt?:FBAdOption){
        this._adId = id;
        this._state = FB_AD_STATE.NONE;
        this._type = type;
        this._refreshInterval = getOption(opt, "refreshInterval", 0);
        this._maxLoadError = getOption(opt, "maxLoadError", 0);

        this._lastShowTime = 0;
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

    protected updateLastShowTime(){
        this._lastShowTime = Date.now();
    }

    protected increaseErrorCounter(){
        this._errorCounter++;
    }

    protected resetErrorCounter(){
        this._errorCounter = 0;
    }

    public isErrorTooMany(){
        return this._maxLoadError>0 && this._errorCounter >= this._maxLoadError;
    }
}

// 有状态的广告对象
abstract class FBStatefulAdUnit extends FBAdUnitBase{
    private _adInstance:FBInstant.AdInstance;

    private _autoLoadOnPlay:boolean; // 播放完毕后是否立即自动加载

    constructor(id:string, type:number, opt?:FBAdOption){
        super(id, type, opt);
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
            this.increaseErrorCounter();

            this._state = FB_AD_STATE.NEW;

            // [6] TODO: 加载失败，自动重新加载
            console.log("自动重新加载: " + this.getInfo());
            this.loadAsync();
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
                this.loadAsync();
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
                    console.log("自动重新加载: " + this.getInfo());
                    this.loadAsync();
                }    
            }

            throw e;
        }

        // return false;
    }
}

class FBInterstitialUnit extends FBStatefulAdUnit{
    constructor(id:string, opt?:FBAdOption){
        super(id, FB_AD_TYPE.INTERSTITIAL, opt);
    }

    protected async createAdInstanceAsync(adId: string){
        return await FBInstant.getInterstitialAdAsync(this._adId);
    }
}

class FBRewardedVideoUnit extends FBStatefulAdUnit{
    constructor(id:string, opt?:FBAdOption){
        super(id, FB_AD_TYPE.REWARDED_VIDEO, opt);
    }

    protected async createAdInstanceAsync(adId: string){
        return await FBInstant.getRewardedVideoAsync(this._adId);
    }
}

class FBBannerUnit extends FBAdUnitBase{
    constructor(id:string, opt?:FBAdOption){
        super(id, FB_AD_TYPE.BANNER, opt);
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

// 广告管理器示例
export default class FBAdManager{
    private static _interstitialAds:Array<FBStatefulAdUnit> = [];
    private static _rewardedVideos:Array<FBStatefulAdUnit> = [];
    private static _banners:Array<FBBannerUnit> = [];

    private static _bannerSupport = undefined;

    public static defaultInterstitialOption:FBAdOption = {
        autoLoadOnPlay: FB_AUTO_LOAD_ON_PLAY,
        refreshInterval: FB_INTERSTITIAL_REFRESH_INTERVAL,
        maxLoadError: FB_MAX_INTERSTITIAL_ERROR
    };

    public static defaultRewardedVideoOption:FBAdOption = {
        autoLoadOnPlay: FB_AUTO_LOAD_ON_PLAY,
        refreshInterval: FB_REWARDED_VIDEO_REFRESH_INTERVAL,
        maxLoadError: FB_MAX_REWARDED_VIDEO_ERROR
    };
    
    public static defaultBannerOption:FBAdOption = {
        autoLoadOnPlay: FB_AUTO_LOAD_ON_PLAY, // banner不需要这个参数
        refreshInterval: FB_BANNER_REFRESH_INTERVAL,
        maxLoadError: FB_MAX_BANNER_ERROR
    };

    // 添加插屏广告
    public static addInterstitial(id:string){
        if(this._interstitialAds.length >= FB_MAX_AD_INSTANCE){
            console.log("添加插屏广告失败, 超出限制: " + this._interstitialAds.length, id);
            throw ErrorTooManyAdInstance;
        }

        let adUnit = new FBInterstitialUnit(id, this.defaultInterstitialOption);

        this._interstitialAds.push(adUnit);
        console.log("添加插屏视频广告: " + id, "count: " + this._interstitialAds.length);

        return adUnit;
    }

    // 添加激励视频广告
    public static addRewardedVideo(id:string){
        if(this._rewardedVideos.length >= FB_MAX_AD_INSTANCE){
            console.log("添加激励视频广告失败, 超出限制: " + this._rewardedVideos.length, id);
            throw ErrorTooManyAdInstance;
        }
        
        let adUnit = new FBRewardedVideoUnit(id, this.defaultRewardedVideoOption);
        this._rewardedVideos.push(adUnit);
        console.log("添加激励视频广告: " + id, "count: " + this._rewardedVideos.length);

        return adUnit;
    }

    public static addBanner(id:string){
        let adUnit = new FBBannerUnit(id, this.defaultBannerOption);
        this._banners.push(adUnit);
        console.log("添加Banner广告: " + id, "count: " + this._banners.length);

        return adUnit;
    }

    // 添加完毕后初始化和预加载
    public static loadAll(){
        console.log("初始化广告队列");
        this._interstitialAds.forEach(adUnit => {
            adUnit.loadAsync();
        });
        this._rewardedVideos.forEach(adUnit => {
            adUnit.loadAsync();
        });
    }

    private static _isAdReady(type: FB_AD_TYPE){
        let adUnits = type == FB_AD_TYPE.INTERSTITIAL?this._interstitialAds:this._rewardedVideos;
        let isReady = false;
        for(let i=0;i<adUnits.length;i++){
            const adUnit = adUnits[i];
            if(adUnit.isReady()){
                isReady = true;
                break;
            }
        }

        return isReady;
    }

    private static _showAsync(type: FB_AD_TYPE){
        let adUnits = type == FB_AD_TYPE.INTERSTITIAL?this._interstitialAds:this._rewardedVideos;
        let readyUnit:FBStatefulAdUnit = null;
        for(let i=0;i<adUnits.length;i++){
            const adUnit = adUnits[i];
            if(adUnit.isReady()){
                readyUnit = adUnit;
                break;
            }
        }

        if(readyUnit != null){
            return readyUnit.showAsync();
        }

        throw ErrorNoReadyAdInstance;
    }

    // 判断是否可以播放插屏广告
    public static isInterstitialAdReady(){
        return this._isAdReady(FB_AD_TYPE.INTERSTITIAL);
    }

    // 播放插屏广告
    public static async showInterstitialAd(){
        return await this._showAsync(FB_AD_TYPE.INTERSTITIAL);
    }

    // 判断是否可以播放激励视频广告
    public static isRewardedVideoReady(){
        return this._isAdReady(FB_AD_TYPE.REWARDED_VIDEO);
    }

    // 播放激励视频广告
    public static async showRewardedVideo(){
        return await this._showAsync(FB_AD_TYPE.REWARDED_VIDEO);
    }

    // 检查是否支持对应API
    public static checkApiSupport(api:string){
        if(FBInstant.getSupportedAPIs().indexOf(api) >= 0){
            return true;
        }
        else{
            return false;
        }
    }

    // 是否支持banner
    public static isBannerSupport(){
        if(typeof this._bannerSupport == "undefined"){
            this._bannerSupport = this.checkApiSupport(FB_API_BANNER);   
        }

        return this._bannerSupport;
    }

    // 播放默认banner广告
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

    // 隐藏默认banner广告
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