var https=require("https");
var querystring=require("querystring");
var rp=require("request-promise");
var merge=require("./merge_recursively");

module.exports = {
  authorize: authorize
  , init: init
  , request : request
  , removeToken:removeToken
  , removeUser: removeUser
  , bucket: Bucket
  , getUserById: getUserById
  , getUserByToken: getUserByToken
}
var simperium=require("./simperium");
var authenticatedUsers={};
var user2id={};
var token2users={};
var request=rp.defaults({
  port:443
  , json:true
});

function authorize(apiKey,appName,username,password){
  return new Promise(function(fulfill,reject){
    if(authenticatedUsers[user2id[username]]){
      reject(authenticatedUsers[user2id[username]]);
    } else{
      var user=new User();
      user.username=username;
      user.appName=appName;
      user.apiKey=apiKey,
      request.post({
        url: "https://auth.simperium.com/1/"+appName+"/authorize/"
        , headers: {"x-simperium-api-key":apiKey}
        , json: {"username":username,"password":password}
      }).then(function(response){
          user.userId=response.userid;
          user.accessToken=response.access_token;
          user2id[username]=response.userid;
          token2users[response.access_token]=response.userid;
          return user.bucketList(user);
          }
        ,function(error){
          reject(error);
      }).then(function(resp){
          authenticatedUsers[user.userId]=user;
          fulfill(authenticatedUsers[user.userId]);
        },function(error){
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
  var user=new User();
  user.appName=appName;
  user.userId=userId;
  user.accessToken=accessToken;
  authenticatedUsers[userId]=user;
  return authenticatedUsers[userId];
}
function User(){
  var apiKey;
  var appName;
  var userId;
  var accessToken;
  var buckets;
  var bucketList;
}
User.prototype.bucketList=function(user){
  return new Promise(function(fulfill,reject){
    user.buckets={};
    request.get({
        url: "https://api.simperium.com/1/"+this.appName+"/buckets",
        headers: {"x-simperium-token":user.accessToken}
    }).then(function(json){
        this.buckets={};
        for(i=0;i<json.buckets.length;i++){
          user.getBucket(json.buckets[i].name.toLowerCase());
        }
        fulfill(json);
      },function(error){
        reject(error);
      });
    });
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
function getUserByName(userName){
    return authenticatedUsers[user2Id[userId]];
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
  url="https://api.simperium.com"+bucket.bucketPath+"i/"+itemId;
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
  hostname=options.hostname||"api.simperium.com";
  path = options.path || "/1/miles-secretaries-5c5/authorize/";
  method = options.method || "POST";
  headers = options.headers || {};
  payload = options.payload || "";
  format = format || "json";
  var options = {
    hostname: hostname,
    port: 443,
    path: path,
    method: method,
    headers: headers
  };
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