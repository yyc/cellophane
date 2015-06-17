var https=require("https");
var querystring=require("querystring");
var rp=require("request-promise");
var merge=require("./lib/merge_recursively");

module.exports = {
  authorize: authorize
  , init: init
  , request : request
  , removeToken:removeToken
  , removeUser: removeUser
  , bucket: Bucket
  , getUserById: getUserById
  , getUserByToken: getUserByToken
  , getUserByUsername: getUserByUsername
}
var authenticatedUsers={};//userId:user
var user2id={};//username:userId
var token2users={};//accessToken:userid
var request=rp.defaults({
  port:443
  , json:true
});

function authorize(apiKey,appName,username,password){
  return new Promise(function(fulfill,reject){
    if(authenticatedUsers[user2id[username]]){
      fulfill(authenticatedUsers[user2id[username]]);
    } else{
      console.log("Makin' a request");
      var user=new User();
      user.username=username;
      user.appName=appName;
      user.apiKey=apiKey;
      var options={
        url: "https://auth.simperium.com/1/"+appName+"/authorize/"
        , headers: {"x-simperium-api-key":apiKey}
        , json: {"username":username,"password":password}
      };
      console.log(options);
      request.post(options).then(function(response){
          user.password=password;
          user.userId=response.userid;
          user.accessToken=response.access_token;
          user2id[username]=response.userid;
          token2users[response.access_token]=response.userid;
          return user.bucketList();
          }
        ,function(error){
          console.log("Request error");
          reject(error);
      }).then(function(){
          authenticatedUsers[user.userId]=user;
          fulfill(user);
        },function(error){
          console.log("bucketlist error",error);
          reject(error);
        });
    }
  });
}
function removeUser(userid){
  if(authenticatedUsers[userid]){
    user = authenticatedUsers[userid];
    delete token2users[user.accessToken];
    if(user2id[user.username]){
      delete user2id[user.username];
    }
  }
}
function removeToken(accessToken){
  if(token2users[accessToken]){
    delete token2users[accessToken];
  }
}
function init(appName,userId,accessToken){
  var user;
  if(typeof appName=="object"){
    user=new User(appName);
    if(appName.username&&appName.userId){
      user2id[appName.username]=appName.userId;
    }
    return user;
  }
  else{
    user=new User();
    user.appName=appName;
    user.userId=userId;
    user.accessToken=accessToken;
    authenticatedUsers[userId]=user;
    token2users[accessToken]=userId;
    return authenticatedUsers[userId];
  }
}
function getUserByToken(accessToken,userId){
  if(authenticatedUsers[token2users[accessToken]]){
    return authenticatedUsers[token2users[accessToken]];
  } else if(userId){
    token2users[accessToken]=userId;
    if(authenticatedUsers[userId]){
      return authenticatedUsers[userId];
    } else{
      return false;
    }
  } else{
    return false;
  }
}
function getUserById(userId,appName,accessToken){
    return authenticatedUsers[userId];
}
function getUserByUsername(userName){
    return authenticatedUsers[user2id[userName]];
}

function User(userObj){
  var apiKey;
  var appName;
  var userId;
  var accessToken;
  var buckets;
  if(userObj){
    merge(this,userObj);
  }
  if(this.userId){
    authenticatedUsers[this.userId]=this;
    if(this.accessToken){
      token2users[this.accessToken]=this.userId;
    }
  }
}
User.prototype.addToken=function(accessToken){
  token2users[accessToken]=this.userId;
}
User.prototype.addAuth=function(username){
  this.username=username;
  user2id[username]=this.userId;
}
User.prototype.bucketList=function(buckets){
  self=this;
  if(buckets){
    self.buckets={};
    buckets.forEach(function(bucketName){
      self.getBucket(bucketName);
    });
    return Promise.resolve();
  }
  else{
    return new Promise(function(fulfill,reject){
      request.get({
          url: "https://api.simperium.com/1/"+self.appName+"/buckets",
          headers: {"x-simperium-token":self.accessToken}
      }).then(function(json){
          self.buckets={};
          for(i=0;i<json.buckets.length;i++){
            self.getBucket(json.buckets[i].name.toLowerCase());
          }
          fulfill(json);
        },function(error){
          reject(error);
        });
      });
  }
}
User.prototype.getBucket=function(bucketName){
  if(this.buckets[bucketName]){//bucket already initialized
    return this.buckets[bucketName];
  }else{//init new bucket
    var bucket=new Bucket();
    bucket.init(this,bucketName);
    this.buckets[bucketName]=bucket;
    return this.buckets[bucketName];
  }
}
User.prototype.remove=function(){
  removeUser(this.userId);
}
function Bucket(){
  var bucketName;
  var apiKey;
  var appName;
  var accessToken;
  var bucketPath;
  var itemCount;
}
Bucket.prototype.init=function(user,bucketName){
  if(typeof user == "object"){
  } else{
    user=authenticatedUsers[user];
  }
  this.apiKey=user.apiKey;
  this.appName=user.appName;
  this.bucketName=bucketName;
  this.accessToken=user.accessToken;
  this.bucketPath="/1/"+this.appName+"/"+this.bucketName+"/";
}
Bucket.prototype.index=function(options){
  bucket=this;
  if(!options){
    options={};
    options.data=true;
  }else{
    options.data=options.data || true;
  }
  return request.get({
    url:"https://api.simperium.com"+bucket.bucketPath+"index"
    , qs: options
    , method: "GET"
    , headers: {"x-simperium-token":bucket.accessToken}
  });
}
Bucket.prototype.getAll=function(){
  bucket=this;
  return bucket.requestAllJson({
    url:"https://api.simperium.com"+bucket.bucketPath+"index"
    , qs: {
      data:true
    }
    , method: "GET"
    , headers: {"x-simperium-token":bucket.accessToken}
  }).then(function(res){
    bucket.itemCount=res.index.length;
    return Promise.resolve(res);
  });
  
}
Bucket.prototype.itemRequest=function(itemId,method,version){
  //returns full response with headers and status code, not just the response body.
  url="https://api.simperium.com"+this.bucketPath+"i/"+itemId;
  if(version){
    url+="/v/"+version;
  }
  method=method || "GET";
  return request({
    url: url
    , resolveWithFullResponse: true
    , method: method
    , headers: {"x-simperium-token": bucket.accessToken}
  });
};
/*
Bucket.prototype.request=function(options,callback,format){
  format=format || "json";
  defaults={
    hostname: "api.simperium.com"
    , method: "GET"
    , headers: {"x-simperium-token":this.accessToken}
  };
  merge(defaults,options);
  request(defaults,callback,format)
}
*/
Bucket.prototype.requestAllJson=function(options){
  return new Promise(function(fulfill,reject){
    var response={};
    var promiseArray=[];
    var handleResponse=function(res){
      return new Promise(function(fulfill,reject){
        merge(response,res);
        if(res.mark){
          options.qs.mark=res.mark;
          promiseArray.push(request(options).then(handleResponse,function(error){
            reject(error);
            log(error);
          }));
          promiseArray[promiseArray.length-1].then(function(){
            fulfill();
          });
        }
        else{
          fulfill();
        }
      });
    };
    bucket=this;
    promiseArray.push(request(options).then(handleResponse
    ,function(error){
      reject(error);
      log(error);
    }));
    Promise.all(promiseArray).then(function(){
      fulfill(response);
    },function(error){
      reject(error);
    })
  });
}


function makeRequest(options,callback,format){
  if(method=="GET"){
  options.path+="?"+querystring.stringify(payload);
  }
  log("Making",method,"request to ",hostname+options.path)
  log("With headers",JSON.stringify(headers));
  log("And payload",payload);
  secureRequest=https.request(options,function(res){
    response="";
    res.on("data",function(data){
      response+=data.toString();
    }).on("end",function(){
      log("Request ended with code "+res.statusCode);
      if(res.statusCode==200){
        if(format=="json"){
          callback(false,JSON.parse(response));
        }
        else{
          callback(false,response);
        }
      }
      else if(res.statusCode==412){
        if(format=="json"){
          json=JSON.parse(response);
          json.statusCode=412;
          callback(false,json);
        }
        else{
          callback(false,response);
        }
      }
      else{
        callback(true,"HTTP "+res.statusCode+": "+response);
      }
    }).resume();
  });
  secureRequest.on("error",function(error){
    callback(true,error);
  });
  if(method=="POST"){
    secureRequest.end(payload);
  }else{
    secureRequest.end();
  }
}


function log(options){
  if (process.env.NODE_ENV !== 'test') {
    console.log(options);
  }
}