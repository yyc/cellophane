/*
var https=require("https");
var querystring=require("querystring");
*/
var simperium=require('./simperium');
var user;
var bucket;

module.exports = function(socket,options){
//  socket.emit("reply","Test FAILED");
}
/*
simperium.init("11afb5edc0b74c75b21518654f960d5f","miles-secretaries-5c5","yuchuan@tinkertanker.com","password",function(err,res){
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

Production
X-Simperium-API-Key: 59d266d2e77d4c89a39fad5172a5f3f7
X-Simperium-Token: 9a61ffb9001949c799a02a818bd2dc51
App Name: photo-wages-1b6

curl -H 'X-Simperium-API-Key: 59d266d2e77d4c89a39fad5172a5f3f7' -d '{"username":"yyc478@gmail.com", "password":"password"}' https://auth.simperium.com/1/photo-wages-1b6/authorize/

curl -H 'X-Simperium-API-Key: 59d266d2e77d4c89a39fad5172a5f3f7' -d '{"username":"yyc478@gmail.com", "password":"password"}' http://localhost:5000/1/photo-wages-1b6/authorize/

clear && curl -H 'X-Simperium-Token: c8ae12b2a8ab485a9b0effd3c9100866' http://localhost:5000/1/photo-wages-1b6/buckets

curl -H 'X-Simperium-Token: c8ae12b2a8ab485a9b0effd3c9100866' https://api.simperium.com/1/photo-wages-1b6/buckets

var cb=function(err,resp){
  if(!err){
    console.log("Success!",resp);
    }
  else{
    console.log("some error occurred");
    console.log(err);
  }
}

*/
/*

bucket=new simperium.bucket();
bucket.init({
  accessToken:"9a61ffb9001949c799a02a818bd2dc51"
  , appName: "photo-wages-1b6"
},"table");
bucket.index(function(err,res){
  console.log(err,res);
},{
  limit:10
});
*/

