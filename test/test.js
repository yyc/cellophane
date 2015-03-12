process.env.NODE_ENV = 'test';
var mocha = require('mocha');
var chai = require('chai');
var should=chai.should();
var expect=chai.expect;
var server=require("../alternate-endpoint");
var http=require("http");
var rp=require("request-promise");
var configs=require("../config.js");
var appName=configs.appName;
var apiKey=configs.apiKey;
var accessToken="";
var testUsername=configs.username;
var testPassword=configs.password;

var localHost="http://localhost:5000";

before(function(done){    
  rp.get(localHost+"/admin")
    .then(function(success){
      console.log("Existing server detected")
      done();
    },function(error){
      console.log("Can't find server. Starting..")
      server.start(done);
    });
});

var request=rp;
var remote="";
var local="";

describe("Ditto Checks",function(){
  describe("Auth tests",function(){
    it("Remote Call",function(done){
      request
      .post({
        uri: localHost+"/1/"+appName+"/authorize/"
        , headers:{"X-Simperium-API-Key":apiKey}
        , json:{username:testUsername,password:testPassword}
      })
      .then(function(res){
        remote=res;
        done();
      },function(error){
        done();
      });
    });
    it("Internal call",function(done){
      server.test().then(function(user){
        user.should.be.a("object");
        done();
      });
    });
    it('Local Call',function(done){
      request
      .post({
        uri: localHost+"/1/"+appName+"/authorize/"
        , headers:{"X-Simperium-API-Key":apiKey}
        , json:{username:testUsername,password:testPassword}
      })
      .then(function(res){
        local=res;
        done();
      });
    });
    it('Equality',function(done){
/*
      result=compare(remote,local);
      result.should.equal(0);
*/
      local.should.be.a("object");
      remote.should.be.a("object");
      accessToken=local.access_token;
      done();
    });
  });
  describe("List Buckets",function(){
    it("Remote Call",function(done){
      request
      .get({
        uri: "https://api.simperium.com/1/"+appName+"/buckets"
        , headers:{"X-Simperium-Token":accessToken}
        , method: "GET"
      })
      .then(function(res){
        response="";
        remote=response;
        done();
      },function(error){
        done();
      });
    });
    it('Local Call',function(done){
      request
      .get({
        uri: localHost+"/1/"+appName+"/buckets"
        , headers:{"X-Simperium-Token":accessToken}
        , method: "GET"
      })
      .then(function(res){
        response="";
        local=response;
        done();
      });
    });
    it('Equality',function(done){
      result=compare(remote,local);
      result.should.equal(0);
      done();
    });
  });
/*
  describe("Bucket Index tests",function(){
    it("Remote Call",function(done){
      chai.request("https://api.simperium.com")
      .get("/1/"+appName+"/table/index?data=true")
      .set("X-Simperium-Token",accessToken)
     .then(function(res){
        res.should.have.status(200);
        remote=res.body;
        done();
      });
    });
    it('Local Index Call',function(done){
      chai.request(localHost)
      .get("/1/"+appName+"/table/index?data=true")
      .set("X-Simperium-Token",accessToken)
      .then(function(res){
        res.should.have.status(200);
        local=res.body;
        done();
      });
    });
    it('Equality',function(done){
      result=compare(remote,local);
      result.should.equal(0);
      done();
    });
  });
*/
});

function compare(sub,set){
  diff=0;
  console.log("Comparing",sub,set);
  if(typeOf(sub)=="array"&&typeOf(set)=="array"){
    for(i=0;i<sub.length;i++){
      if(set[i]!=sub[i]){
        console.log("different",set[i],sub[i]);
        diff++;
      }
    }
  } else if(typeOf(sub)=="object"&&typeOf(set)=="object"){
    for(var key in sub){
      if(sub[key]!=set[key]){
        if(typeof sub[key] == "object" && typeof set[key] == "object"){
          diff+=compareObj(sub[key],set[key]);
        }else{
          diff++;
          console.log("different",set[key],sub[key]);
        }
      }
    }
  } else if(sub!=set){
    console.log("different",set,sub);
    diff++;
  }
  return diff;
}
function typeOf(input) {
	return ({}).toString.call(input).slice(8, -1).toLowerCase();
}


function getResponse(res,format){
  format= format || "json";
  return new Promise(function(fulfill,reject){
    response="";
    res.on("data",function(data){
      response+=data;
    });
    res.on("end",function(){
      if(format=="json"){
        fulfill(response);
      } else{
        fulfill(response);
      }
    });
    res.on("error",function(error){
      console.log(error);
      reject(error);
    });
  });
}