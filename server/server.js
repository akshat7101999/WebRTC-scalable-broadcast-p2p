const HTTPS_PORT = 8443; //default port for https is 443
const HTTP_PORT = 8001; //default port for http is 80
//objects and variables to be used later
var CLIENTS_EVEN = [];
var CLIENTS_ODD = [];
var CLIENTS1 = [];
var DHT_EVEN = [];
var DHT_ODD = [];
var tThreshold =250;
var ID;
var chain = 0;
var lowChain = 0;
var random;
//node requirements
const fs = require('fs');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const WebSocketServer = WebSocket.Server;
// Yes, TLS is required
//server congigurations
const serverConfig = {
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem'),
};

// ----------------------------------------------------------------------------------------

// Create a server for the client html page
const handleRequest = function (request, response) {
  // Render the single client html file for any request the HTTP server receives
  console.log('request received: ' + request.url);

 if (request.url === '/webrtc.js') {
    response.writeHead(200, { 'Content-Type': 'application/javascript' });
    response.end(fs.readFileSync('client/webrtc.js'));
  } else if (request.url === '/style.css') {
    response.writeHead(200, { 'Content-Type': 'text/css' });
    response.end(fs.readFileSync('client/style.css'));
  } else {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end(fs.readFileSync('client/index.html'));
  }
};

const httpsServer = https.createServer(serverConfig, handleRequest);
httpsServer.listen(HTTPS_PORT);

// ----------------------------------------------------------------------------------------

// Create a server for handling websocket calls
const wss = new WebSocketServer({ server: httpsServer });

//when a connection is established
wss.on('connection', function (ws) {

  ws.on('message', function (message) {
    //console.log('received: %s', message);

    //parse JSON string to JSON object
    recv = JSON.parse(message) 
    console.log(recv.time);

    //if a raise hand request is placed
    if(recv.raiseHand==true){
      ID=0
      wss.raiseHandMaster(message);
    }
    
    //for high bandwidth clients
    if(parseInt(recv.time)  < parseInt(tThreshold)){

      //for updating DHT after churn
      if(recv.reform!=undefined){
        console.log("advancing to next peer")
        wss.nextPeer(message);
      }

      //if churn has taken place
      if(recv.churn==true){
        wss.relayClient(message);
      }

      /* Forming connections in a high bandwidth chain */

      //for first client
      if(CLIENTS1.length==0){
        CLIENTS1.push("first");
        ws.id = recv.uuid
        //push the uuid of first client i.e. master in both arrays and DHTS
        DHT_EVEN.push(ws.id);
        DHT_ODD.push(ws.id);
        CLIENTS_EVEN.push(ws.id)
        CLIENTS_ODD.push(ws.id)
        wss.firstBroadcast(message)
      }

      //for any new peer connecting
      else if(recv.dest == "all"){
        //even chain 
        if(chain % 2 == 0){
          chain++;
          console.log("normal broadcast even");
          ws.id = recv.uuid
          //push uuid in even chain DHT
          DHT_EVEN.push(ws.id)
          console.log(DHT_EVEN)
          //send DHT when full
          if(DHT_EVEN.length == 4){
            console.log("DHT function is reached")
            wss.sendDHT(message, DHT_EVEN);
            DHT_EVEN.splice(0,1);
          }
          //push uuid in the even clients array
          CLIENTS_EVEN.push(ws.id)
          wss.broadcast(message, CLIENTS_EVEN);
        }
        //odd chain
        else if(chain % 2 == 1){
          chain++;
          console.log("normal broadcast odd");
          ws.id = recv.uuid
          //push uuid in odd chain DHT
          DHT_ODD.push(ws.id)
          console.log(DHT_ODD)
          //send DHT when full
          if(DHT_ODD.length == 4){
            console.log("DHT function is reached")
            wss.sendDHT(message, DHT_ODD);
            DHT_ODD.splice(0,1);
          }
          //push uuid in the odd clients array
          CLIENTS_ODD.push(ws.id)
          wss.broadcast(message, CLIENTS_ODD);
        }
      }
      //for forming a new connection after the preceding client disconnects
      else if(recv.dest1!=undefined){
        wss.peerJoin(message);

      }

      //to send a reply to the new peer
      else{
        wss.reverseBroadcast(message)
      }


    }
    //for low bandwidth clients
    else if(recv.time  > tThreshold){

      //even chain
      if(lowChain % 2 == 0){
        
        if(CLIENTS_EVEN.length>=2){
          console.log("low bandwidth broadcast even")

          if(recv.dest=="all"){
            lowChain++;
            //for a new client connect to a random client in the even high bandwidth chain
            if(recv.renewID==undefined){
              random = Math.floor(Math.random() * CLIENTS_EVEN.length) + 1 ;
            }
            //for a new connection after churn connects to a random client in proximity to its previous connection
            else{
              random = Math.floor(Math.random() * 3) + (parseInt(recv.renewID)-3) ;
              console.log(random, "random even")
            }
            ID = CLIENTS_EVEN[random];
            ws.id=recv.uuid
            recv.ID = random
            if(recv.renewID==undefined){
              message=JSON.stringify(recv);
            }
          }
          wss.lowBroadcast(message)
        }
      }
      //odd chain
      else if(lowChain % 2 == 1){
        
        if(CLIENTS_ODD.length>=2){
          console.log("low bandwidth broadcast odd")
          if(recv.dest=="all"){
            lowChain++;
            //for a new client connect to a random client in the even high bandwidth chain
            if(recv.renewID==undefined){
              random = Math.floor(Math.random() * CLIENTS_ODD.length) + 1 ;
            }
            //for a new connection after churn connects to a random client in proximity to its previous connection
            else{
              random = Math.floor(Math.random() * 1) + (parseInt(recv.renewID)-1) ;
              console.log(random, "random odd")
            }
            ID = CLIENTS_ODD[random];
            ws.id=recv.uuid
            recv.ID = random
            message=JSON.stringify(recv);
          }
          wss.lowBroadcast(message)
        }
      }
    }
    
    
  
    
  });
  //terminate the socket on error
  ws.on('error', () => ws.terminate());
});

/*Low Bandwidth Functions*/

wss.lowBroadcast = function(data){
  console.log("low bandwidth broadcast function ")
  this.clients.forEach(function(client){
    if(recv.dest == "all"){
      if(client.id==ID){
        if(client.readyState===WebSocket.OPEN){
          client.send(data);
        }
      }
    }else{ 
      if(client.id == recv.dest){
        if(client.readyState===WebSocket.OPEN){
          client.send(data);
        }
      }
    }
  })
}

/*High Bandwidth Functions*/

//informs the following clients about the churn
wss.relayClient = function(data){
  this.clients.forEach(function (client){
    if(client.id == recv.uuid){
      if (client.readyState === WebSocket.OPEN){
        client.send(JSON.stringify({"churn": true}))
      }
    }
  })
}

//to update DHT after churn
wss.nextPeer = function(data){
  if(recv.reform== "1"){
    console.log("next peer executed reform 1")
    this.clients.forEach(function (client){
      if(client.id == recv.nextPeer){
        
        if (client.readyState === WebSocket.OPEN){
          console.log("next peer executed reform 1  and id matched")
          client.send(JSON.stringify({"updateDHT": recv.uuid, "reform": "1"}))
        }
      }
    })
  }else if(recv.reform=="2"){
    console.log("next peer executed reform 2")
    this.clients.forEach(function (client){
      
      if(client.id == recv.nextPeer){
        if (client.readyState === WebSocket.OPEN){
          console.log("next peer executed reform 2  and id matched")
          client.send(JSON.stringify({"updateDHT": recv.uuid, "reform": "2"}))
        }
      }
    })
  }else if(recv.reform=="3"){
    console.log("next peer executed reform 3")
    this.clients.forEach(function (client){
      if(client.id == recv.nextPeer){
        
        if (client.readyState === WebSocket.OPEN){
          console.log("next peer executed reform 3  and id matched")
          client.send(JSON.stringify({"updateDHT": recv.uuid, "reform": "3"}))
        }
      }
    })
  } 


}

//to form connections after a churn
wss.peerJoin = function(data){
  this.clients.forEach(function (client){
    if(client.id == recv.dest1){
      if (client.readyState === WebSocket.OPEN){
        client.send(JSON.stringify({ 'displayName': recv.displayName, 'uuid': recv.uuid, "dest": "all"}));
      }
    }
  })
}
//broadcast message to all clients along with parameter first to identify the master
wss.firstBroadcast = function (data){

  //converting a JSON object into a normal object
  recv = JSON.parse(data) 
  //a loop for each client
  this.clients.forEach(function (client){
      if (client.readyState === WebSocket.OPEN) {  
        //sends a JSON string to all clients
        client.send(JSON.stringify({ 'displayName': recv.displayName, 'uuid': recv.uuid, 'dest': recv.dest, "first" : 0}));
        }
    });
}

//to send DHT
wss.sendDHT = function(data, DHT){
  recv = JSON.parse(data)
  console.log("DHT HAS BEEN SENT");
  this.clients.forEach(function(client){
    if(String(client.id) == String(DHT[2])){
      if (client.readyState === WebSocket.OPEN) {  
        client.send(JSON.stringify({'DHT': "DHT", "valueDHT" : DHT}));
        }
    }
  })
}

//to send response to a peer
wss.reverseBroadcast = function (data){
  console.log("reverse broadcast", recv.dest)
  this.clients.forEach(function (client){
    if(client.id == recv.dest){
      if (client.readyState === WebSocket.OPEN) {  
        client.send(data);
        }
    }
  });
}

//forwards the raise hand request to the master
wss.raiseHandMaster= function (data){
  this.clients.forEach(function (client){
    if(client.id==CLIENTS_EVEN[0]){
      if (client.readyState === WebSocket.OPEN) {  
        client.send(JSON.stringify({ 'displayName': recv.displayName, 'uuid': recv.uuid, "dest": "all", 'raiseHand':true}));
        } 
    }
  })
}
//broadcast function to send data selectively
wss.broadcast = function (data, CLIENTS) {
  
  this.clients.forEach(function (client) {
    //if there is only one client
    if (CLIENTS.length==1){
      if (client.readyState === WebSocket.OPEN) {  
      client.send(data);
      }
    }
    //every new connecting peer connects to only its predecessor
    else if(client.id==CLIENTS[CLIENTS.length-2]){
     
      if (client.readyState === WebSocket.OPEN) {
      
        client.send(data);
      }
    }
    
  });


};


console.log('Server running.');

// Separate server to redirect from http to https
http.createServer(function (req, res) {
    console.log(req.headers['host']+req.url);
    res.writeHead(301, { "Location": "https://" + req.headers['host'] + req.url });
    res.end();
}).listen(HTTP_PORT);