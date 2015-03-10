var https=require("https");
var querystring=require("querystring");
var merge=require("./merge_recursively")

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
var authenticatedUsers={};
var user2id={};
var token2users={};

function authorize(apiKey,appName,username,password,callback){
  if(authenticatedUsers[user2id[username]]){
    callback(false,authenticatedUsers[user2id[username]]);
  } else{
    var user=new User();
    user.appName=appName;
    user.apiKey=apiKey,
    request({
      hostname: "auth.simperium.com",
      path:"/1/"+appName+"/authorize/",
      method:"POST",
      headers: {"x-simperium-api-key":apiKey},
      payload: JSON.stringify({"username":username,"password":password})
    },function(err,response){
      if(!err){
        user.userId=response.userid;
        user.accessToken=response.access_token;
        user2id[username]=response.userid;
        token2users[response.access_token]=response.userid;
        user.bucketList(user,function(error,res){
          if(!error){
            authenticatedUsers[response.userid]=user;
            callback(false,authenticatedUsers[response.userid]);
          }else{
            callback(true,user);
          }
        });
      }
      else{
        callback(true,response);
      }
    });
  }
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
User.prototype.bucketList=function(user,callback){
  user.buckets={};
  request({
      hostname: "api.simperium.com",
      path:"/1/"+this.appName+"/buckets",
      method:"GET",
      headers: {"x-simperium-token":this.accessToken}
  },function(err,json){
    if(!err){
      var buckets={};
      console.log(JSON.stringify(json));
      for(i=0;i<json.buckets.length;i++){
        user.getBucket(json.buckets[i].name);
      }
      callback(false,response);
    } else{
      callback(true,response);
    }
    
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
function Bucket(){
  var bucketName;
  var apiKey;
  var appName;
  var accessToken;
  var bucketPath;
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
Bucket.prototype.index=function(callback,options){
  if(!options){
    options={};
    options.data=true;
  }else{
    options.data=options.data || true;
  }
  if(options.limit){
    var format="json";
    if(options["format"]){
      format=options["format"];
      delete options["format"];
    }
    this.request({
      path:this.bucketPath+"index"
      , payload: options
      , method: "GET"
      }, function(err,res){
        if(!err){
          callback(false,res)
        }
        else{
          log(err,res);
          callback(true,res);
        }
    },format);
  } else{
    this.requestAllJson({
      path:this.bucketPath+"index"
      , payload: options
      , method: "GET"
      }, function(err,res){
        if(!err){
          callback(false,res.index,{current:res.current})
        }
        else{
          log(err,res);
          callback(true,res);
        }
    });
  }
}
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
Bucket.prototype.requestAllJson=function(options,callback,response){
  if(!response){
    response={};
  }
  bucket=this;
  this.request(options,function(err,res){
    if(!err){
      merge(response,res);
      if(res.mark){
        options.payload.mark=res.mark;
        bucket.requestAllJson(options,callback,response);
      }
      else{
        response.mark="";
        callback(false,response);
      }
    }else{
      callback(true,response);
      console.log(res);
    }
  },"json");
}
function readItem(bucket,obj,version){
  
}


function request(options,callback,format){
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
  console.log("Making",method,"request to ",hostname+options.path)
  console.log("With headers",JSON.stringify(headers));
  console.log("And payload",payload);
  secureRequest=https.request(options,function(res){
    response="";
    res.on("data",function(data){
      response+=data.toString();
    }).on("end",function(){
      console.log("Request ended with code "+res.statusCode);
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
/*
Authorize User
      >>> curl -H 'X-Simperium-API-Key: { api_key }' \
        -d '{"username":"test@test.com", "password":"test"}' \
        https://auth.simperium.com/1/{ app_id }/authorize/
    >>> {"username": "test@test.com", "access_token": "84f27d20f93b414f8b7bc3441f87c9e1", "userid": "f5067cc81c9c26dcdca468f0cdf60508"} 


Update username/password
      >>> curl -H 'X-Simperium-API-Key: { api_key }' \
        -d '{"username":"test@test.com", "password":"test", "new_username":"test2@test.com"}' \
        https://auth.simperium.com/1/{ app_id }/update/
    >>> {"status": "success"} 

Reset username/password
    >>> curl -H 'X-Simperium-API-Key: { api_key with admin privileges }' \
        -d '{"username":"test@test.com", "new_password":"newpass"}' \
        https://auth.simperium.com/1/{ app_id }/reset_password/
    >>> {"status": "success"} 
    username — Usernames currently must be a valid email address

Delete user
    >>> curl -H 'X-Simperium-API-Key: { api_key with admin privileges }' \
        -d '{"username":"test@test.com"}' \
        https://auth.simperium.com/1/{ app_id }/delete/
    
    >>> {"status": "success"} 

Index of Objects for bucket
    >>> curl -H 'X-Simperium-Token: { access_token }' \
        https://api.simperium.com/1/{ app_id }/{ bucket_name }/index
        

var https=require("https");
var querystring=require("querystring");
var simperium=require('./simperium');
var user;
var bucket;
simperium.init("11afb5edc0b74c75b21518654f960d5f","miles-secretaries-5c5","yyc478@gmail.com","password",function(err,res){
  if(err){
    console.log(err,res);
  }else{
    user=res;
    bucket=user.getBucket("tables");
    bucket.index(function(err,res){
      console.log(err,res);
    });
  }
});

  
  
simperium.request({
      hostname: "api.simperium.com",
      path:"/1/miles-secretaries-5c5/buckets",
      method:"GET",
      headers: {"x-simperium-token":"8fed3276d8314e339403dd019f885d8f"}
  },function(err,response){
    if(!err){
      json=JSON.parse(response);
      console.log(response);
    } else{
      console.log(true,response);
    }
    
  });

*/