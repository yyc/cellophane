function FindProxyForURL(url, host) {
    var proxyhost="obscure-sands-4331.herokuapp.com";
    if (dnsDomainIs(host, ".simperium.com") || shExpMatch(host, "(*.simperium.com|simperium.com)")){
      switch url.substring(0, 4):
      case "http:":
        return "PROXY "+proxyhost+":8001";
      break;
      case "https:":
        return "PROXY "+proxyhost+":80";
      break;
      case "ws:":
      case "wss:":
        return "PROXY "+proxyhost+":8080";
      
      break;
    } else{
 
        return "DIRECT";
    }
 
}