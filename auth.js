var redis=require("then-redis");
var simperium=require("./simperium");
var cache=require("./cache");

module.exports=Auth;
function Auth(configs){
  this.simperium=simperium;
  this.cacheAuth=new cache.Auth(configs.redisOptions);
  this.configs=configs;
}

Auth.prototype.getUserByToken=function(access_token){
  var user;
  if(user=this.simperium.getUserByToken(access_token)){
    return Promise.fulfill(user);
  } else{
    return this.cacheAuth.getUserId(access_token).then(function(userid){
      if(userid){
        if(user=this.simperium.getUserById(userid)){
          return Promise.fulfill(user);
        }
        else{
          return cacheAuth.getUserById(userid).then(function(user){
            return this.simperium.init(user);
          },function(error){
            //Incomplete information, can't continue. Will
            console.log("Unable to fetch user",userid,"from cache.",userText)
          });
        }
      }
      else{
        return Promise.reject();
      }
    });
  }
}
Auth.prototype.getUsers=function(namesonly){
  if(namesonly){
    return this.db.hkeys("~users");
  }
  else{
    return this.db.hgetall("~users");
  }
}
Auth.prototype.removeUser=function(userId){
  
}
Auth.prototype.authorize=function(username,password,appName,apiKey){
  var self=this;
  var user;
  var appName=appName || this.configs.appName;
  var apiKey=apiKey || this.configs.apiKey;
  if(user=this.simperium.getUserByUsername(username)){
    if(password==user){
      return Promise.resolve(user);
    }
    else{
      return Promise.reject("Invalid credentials");
    }
  }
  else{
    return this.cacheAuth.authorize(username,password).then(function(res){
      user=this.simperium.init(res);
      return Promise.resolve(user);
    },function(error){
      if(error==1){
        return Promise.reject("Invalid credentials")
      }
      else{
        console.info("Credentials not found in redis, querying simperium..");
        return this.simperium.authorize(apiKey,appName,username,password)
        .then(function(res){
          this.cacheAuth.addUser(username,password,res.userId,appName);
          this.cacheAuth.addToken(res.userId,res.accessToken);
          return Promise.fulfill(res);
        },function(error){
          return Promise.reject(error);
        });
      }
    })
  }
}
Auth.prototype.addToken=function(userId,token){
  var self=this;
  this.simperium.getUserById(userId).addToken(token);
  return this.db.hset("~accessTokens",token,userId).then(function(){
      return self.db.hset("~userTokens",userId,token);
    });
}
Auth.prototype.exit=function(){
  this.cacheAuth.quit();
}
