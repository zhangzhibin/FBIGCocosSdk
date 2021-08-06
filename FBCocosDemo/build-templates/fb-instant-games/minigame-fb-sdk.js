let dummyPromise = {};
dummyPromise.then = function(callback){
    callback();
}
dummyPromise.catch = function(callback){
    callback("dummy error");
}

let minigame_fb_sdk = {};
window.dataLayer = window.dataLayer || [];
window.gtag = window.gtag || function(){dataLayer.push(arguments);}

minigame_fb_sdk.version = "1.0.0";
minigame_fb_sdk.fbid = "";
minigame_fb_sdk.gtag_id = "";

minigame_fb_sdk.init = function(fbid, gtag_id){
    console.info("==== MiniGame FB SDK init =====");
    console.info("SDK Version: ",  minigame_fb_sdk.version);
    minigame_fb_sdk.fbid = fbid;
    minigame_fb_sdk.gtag_id = gtag_id;
    console.info("Facebook App id: ", fbid);
    console.info("Google Tag id: ", gtag_id);
    console.info("===============================");
    if(typeof(gtag_id)!=undefined && gtag_id.length>0){
        this.loadJsLib("https://www.googletagmanager.com/gtag/js?id=" + gtag_id, false, true);
    }
    
    gtag('js', new Date());
    minigame_fb_sdk.logEvent("app_init");
};

minigame_fb_sdk.loadJsLib = function(libUrl, sync, immediately){
    console.info("loading js lib: url = " + libUrl + ", async: " + !sync);

    const scriptElement = document.createElement('script');
    let loaded = false;
    scriptElement.type = 'text/javascript';
    scriptElement.src = libUrl;
    scriptElement.async = !sync;
    scriptElement.onerror = function(err) {
        console.error("load js lib failed, url =  " + libUrl + ", error: ", err);
    };
    
    let fnReady = function() {
        // console.log(this.readyState); // uncomment this line to see which ready states are called.
        if (!loaded && (!this.readyState || this.readyState === 'complete')) {
            loaded = true;
        }
        console.info("js lib loaded: ", libUrl);
    };

    scriptElement.onload = scriptElement.onreadystatechange = fnReady;
    
    if(!immediately){
        document.body.appendChild(scriptElement);
    }else{
        const scripts = document.getElementsByTagName('script');
        if(scripts.length>0){
            const firstScriptElement = document.getElementsByTagName('script')[0];
            firstScriptElement.parentElement.insertBefore(scriptElement, firstScriptElement);    
        }else{
            document.body.appendChild(scriptElement);
        }
    }
}

minigame_fb_sdk.logEvent = function(eventName, param){
    if(!gtag){
        return;
    }
    gtag("event", eventName, param);
}

minigame_fb_sdk.gtagSet = function(param){
    if(!gtag){
        return;
    }
    if(!param){
        return;
    }

    gtag("set", param);
}

minigame_fb_sdk.fbInitializeAsync = function(){
    if(!FBInstant){
        return;
    }

    return FBInstant.initializeAsync().then(function(){
        minigame_fb_sdk.onFacebookInit();
        return dummyPromise;
    });
}

minigame_fb_sdk.onFacebookInit = function(){
    minigame_fb_sdk.logEvent("fb_init_ready");
    if(!FBInstant){
        return dummyPromise;
    }

    const user_id = FBInstant.player.getID();

    // 设置玩家信息   
    minigame_fb_sdk.gtagSet({
        'user_id': user_id
    });

    FBInstant.getEntryPointAsync().then(function(entry){
        console.info("Entry Point: ", entry);
        minigame_fb_sdk.logEvent('fb_entrypoint', {
            entrypoint:entry
        });
    });

    const contextType = FBInstant.context.getType();
    console.info("Context Type: ", contextType);
    minigame_fb_sdk.logEvent("fb_context", {type: contextType});
}

minigame_fb_sdk.fbStartGameAsync = function(){
    if(!FBInstant){
        return dummyPromise;
    }

    return FBInstant.startGameAsync().then(function(){
        minigame_fb_sdk.onFacebookStartGame();
        return dummyPromise;
    });
}

minigame_fb_sdk.onFacebookStartGame = function(){
    minigame_fb_sdk.logEvent("fb_start_game");
}

window.minigame_fb_sdk = minigame_fb_sdk;

/*
FBInstant.initializeAsync()
    .then(function () {

    // 设置user_id
    const user_id = FBInstant.player.getID();
    gtag("set", {
        "user_id": user_id
    });
    
    // 记录初始化成功事件
    gtag("event", "fb_inited");

    // 记录启动来源
    FBInstant.getEntryPointAsync().then(function(entry){
        console.info("Entry Point: ", entry);
        gtag("event", "fb_entrypoint", {
            entrypoint:entry
        });
    });
    
    // 记录会话类型
    const contextType = FBInstant.context.getType();
    gtag("event", "fb_context", {type: contextType});

    // 其他代码
    // ...
});

FBInstant.startGameAsync()
    .then(function(){
    // 记录fb游戏启动事件
    gtag("event", "fb_started");
    
    // 其他代码
    // ...
});

*/