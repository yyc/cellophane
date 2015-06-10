//It's St. Patrick's Day!
var program=require("commander");
var net=require("net");

//Startup options
program
.usage("[options]")
.option("-p, --port <port>","The port to listen on for all connections. Default behaviour is the value in configs.port if present, or to try binding to 80,5000,5001...",parseInt)
.option("-s, --splitter <port>","The port to listen for the network splitter. Defaults to 6000.")
.option("--simperium","Use Simperium as the main communication channel, with Cellophane as the backup. The default is with Cellophane as the main channel for speed.")
.option("-c , --config <FILENAME>","Custom config file, if applicable. Defaults to config.js in the same directory.")
.option("-r, --redis <IP>","Redis server connection, defaults to the options in configFile or tcp://localhost:6379")
.option("-rp, --rport <port>","Redis server port, defaults to 6379")
.parse(process.argv);

//Fetch config file
configFile=program.config || "config.js";
var configs=require("./"+configFile);

if(program.port){
  process.env.port=program.port;
}
else if(configs.port){
  process.env.port=configs.port;
}
else{
  process.env.port=80;
}

var connected=0;
var server=net.createServer();
server.on("error",function(error){
  console.log("Unable to bind to port "+process.env.port+"!",error);
  connected=0;
  if(process.env.port==80){
    process.env.port=5000;
  }
  else{
    process.env.port++;
  }
  server.listen(process.env.port);
});
server.listen(process.env.port,success);

function success(){
  console.log("Using port "+process.env.port+" with configuration",configs);
  process.options=configs;
  server.close(start);
}
function start(){
  console.log("STARTING NOW");
  var endpoint=require("./alternate-endpoint.js");
  endpoint.start(function(){
    console.log("Server started, listening.");
  });
}