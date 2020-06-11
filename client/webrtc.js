const WS_PORT = 8443; //make sure this matches the port for the webscokets server
var localUuid; //unique id of the client
var localDisplayName; //displayName entered by the client 
var localStream; //local source of audio and video
var remoteStream; //video stream received from previous client
var serverConnection; //to set up a webSocket
//a DHT contains uuids of clients
var DHT; 
var localDHT=[];
//defining variables to be used later in the code
var time;
var lowID;
var tThreshold = 250; //ms
var renewFeed=0;
var raiseHand = 0;
var raiseHandClient = 0;
var lowerHandDown=0;
var peerConnections = {}; // an object used to store information about the connecting peers;key is uuid, values are peer connection object and user defined display name string
var peerStream;
//secondary variables
var count=0;
var first =0;
var flag;
var arr = [];

//configuration details of the RTCPeerConnection
var peerConnectionConfig = { 
  // STUN server used for NAT traversal
  'iceServers': [        
     //ice servers defined 
    { 'urls': 'stun:stun.stunprotocol.org:3478' },
    { 'urls': 'stun:stun.l.google.com:19302' },
  ]
};

// specify audio and video constraints for user media
var constraints = {
    video: {
      width: {max: 320},
      height: {max: 240},
      frameRate: {max: 30},
    },
    audio: true,
  };

//generate a random identifier and capture a user-entered display name
function start() {  
  //create a unique identification id for every new peer
  localUuid = createUUID();  
  // returns a URLSearchParams() object instance.
  var urlParams = new URLSearchParams(window.location.search); 
  
  // check if "&displayName=xxx" is appended to URL, otherwise alert user to populate
 localDisplayName =  urlParams.get('displayName') || prompt('Enter your name', ''); 
   //append the displayName to the localVideoContainer
  document.getElementById('localVideoContainer').appendChild(makeLabel(localDisplayName)); 
   
  //calculating bandwidth
  downlinkspeed()

  // set up local video stream
  //to check that the browser supports getUserMedia API
  if (navigator.mediaDevices.getUserMedia) { 

    //prompts the user for permission to use up to one video input device and up to one audio input device 
    navigator.mediaDevices.getUserMedia(constraints) 
      .then(stream => {
        localStream = stream;
        document.getElementById('localVideo').srcObject = stream; 
        //the stream is assigned to localVideo
      }).catch(errorHandler) 

      // set up websocket and message all existing clients
      .then(() => {
        //serverConnection = new WebSocket('wss://' + "172.16.36.100:8443");
        serverConnection = new WebSocket('wss://' + window.location.hostname);
        serverConnection.onmessage = gotMessageFromServer; 
        // on getting a message from the server call gotMessageFromServer
        serverConnection.onopen = event => { 
        //when the connection is open send localDisplayName and localUuid to all peers, settimeout is used so that this message gets send once time is calculated
          setTimeout(function(){serverConnection.send(JSON.stringify({ 'displayName': localDisplayName, 'uuid': localUuid, 'dest': 'all', "time": time }))},2000 );
        }
      }).catch(errorHandler);

  } else { 
    //if the browser does not support getUserMedia API issue an alert
    alert('Your browser does not support getUserMedia API');
  }

  //Creating a button for raise hand requests
  var myDiv = document.getElementById("GFG");
  // creating button element  
  var button = document.createElement('BUTTON');
  button.setAttribute('id', "raiseHand"); 
  // creating text to be 
  //displayed on button 
  var text = document.createTextNode("Raise Hand"); 
  // appending text to button 
  button.appendChild(text); 
  // appending button to div 
  myDiv.appendChild(button);
  //Add onclick event
  var raiseHandButton = document.getElementById("raiseHand");
  raiseHandButton.onclick = function(){
    raiseHandClient=1;
    lowerHandDown=1;
    serverConnection.send(JSON.stringify({'displayName': localDisplayName, "raiseHand": true, "uuid": localUuid}));
    alert("Please wait while master accepts your request.");  
    
  };
}
// create a function to classify and respond to messages received from the server
function gotMessageFromServer(message) {
  
  //convert the JSON string into an object.
  var signal = JSON.parse(message.data); 
  var peerUuid = signal.uuid; 
  console.log(signal);
  
 
  //for master to entertain raise hand requests
  if(signal.raiseHand == true){
    var answer = window.confirm("Student is trying to ask question ? You want to add him ?"); 
    if(answer){
      raiseHand=1; 
      closePeer(peerUuid);
    }else{
      signal = undefined
    }
  }

  //know the index of high bandwith client in the chain and set the index for low bandwidth clients
  if((signal.ID != undefined)&&(time > tThreshold)){
    lowID = signal.ID;
  }

  //updating DHT after churn
  if(signal.reform != undefined){
    if(signal.reform == "1"){
      serverConnection.send(JSON.stringify({"reform": "2", "nextPeer": signal.updateDHT, "uuid" : String(DHT[1]), "time": time }));
      DHT[3]=signal.updateDHT
    }else if(signal.reform == "2"){
      DHT[1]=DHT[0]
      DHT[0]=signal.updateDHT
    }else if(signal.reform == "3"){
      DHT[0] = signal.updateDHT
    }
  }
  //a peer churn prompts clients to reconnect through exchange of offer/answer
  if(signal.churn == true){
    count=1;
    //if peer didn't get a DHT i.e. peer is the last one in the connection
    if(DHT==undefined){
      serverConnection.send(JSON.stringify({ 'displayName': localDisplayName, 'uuid': localUuid, 'dest1': String(localDHT[0]), "time": time }));
     //for peers having a complete DHT 
    }else{
    serverConnection.send(JSON.stringify({ 'displayName': localDisplayName, 'uuid': localUuid, 'dest1': String(DHT[1]), "time": time }));
    }
  }
  
  //if peer gets a DHT from the server
  if(signal.DHT == "DHT"){
    DHT = signal.valueDHT;
  }
  
  if(signal.first!=undefined){ 
  flag = signal.first  
  }
  //if peer is the first client
  if (signal.first == 0){ 
    
    // set up peer connection object for the master
    setUpPeer(peerUuid, signal.displayName, false, flag)
    return
    
  }
  // ignore messages that are not for us or from ourselves 
  if (peerUuid == localUuid || (signal.dest != localUuid)&&(signal.dest!= "all" )) return;

  
  if (signal.displayName && signal.dest=="all") {
    // set up peer connection object for a newcomer peer
    setUpPeer(peerUuid, signal.displayName); 
    //send localDisplayName and localUuid to peerUuid
    if(signal.ID == undefined){
      serverConnection.send(JSON.stringify({ 'displayName': localDisplayName, 'uuid': localUuid, 'dest': peerUuid, "time": time })); 
    }else{
      serverConnection.send(JSON.stringify({ 'displayName': localDisplayName, 'uuid': localUuid, 'dest': peerUuid, "time": time , "ID": signal.ID})); 
    }
  } else if (signal.displayName && signal.dest == localUuid) {
    //define a localDHT for the last peer
    if(DHT == undefined){
      localDHT.push(signal.uuid);}
      // initiate call if we are the newcomer peer
      setUpPeer(peerUuid, signal.displayName, true);

  } else if (signal.sdp) { 
    peerConnections[peerUuid].pc.setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(function () {
      // Only create answers in response to offers
      if (signal.sdp.type == 'offer') {
        peerConnections[peerUuid].pc.createAnswer().then(description => createdDescription(description, peerUuid)).catch(errorHandler);
      }
    }).catch(errorHandler);

  } else if (signal.ice) { 
    //create a new ice candidate and add to the specific peerUuid
    peerConnections[peerUuid].pc.addIceCandidate(new RTCIceCandidate(signal.ice)).catch(errorHandler);
    
  }

   
}

//if we have a new peer, we can add them to the peerConnections object, with the UUID as a key
function setUpPeer(peerUuid, displayName, initCall = false, f=1) {
  peerConnections[peerUuid] = { 'displayName': displayName, 'pc': new RTCPeerConnection(peerConnectionConfig) };
  //function called on event iceconnectionstatechange 
  peerConnections[peerUuid].pc.oniceconnectionstatechange = event => checkPeerDisconnect(event, peerUuid);

  //if first client
  if(flag == 0){ 
    //function called when an ice candidate is received
    peerConnections[peerUuid].pc.onicecandidate = event => gotIceCandidate(event, peerUuid);

    //adds a stream of the requesting client
    if(raiseHand==1)
      {peerConnections[peerUuid].pc.ontrack = event => gotRemoteStream(event, peerUuid);} 
    //adds a media stream as a local source of audio or video  
    if(localStream != undefined){peerConnections[peerUuid].pc.addStream(localStream);} 
    
  }
  //for other clients
  else{ 
    //function called when an ice candidate is received
    peerConnections[peerUuid].pc.onicecandidate = event => gotIceCandidate(event, peerUuid); 
    //function to be called if event track takes place
    peerConnections[peerUuid].pc.ontrack = event => gotRemoteStream(event, peerUuid); 
  
    //add a media stream as a local source of audio or video if remoteStream is undefined
    if(lowerHandDown==1){
      peerConnections[peerUuid].pc.addStream(localStream);
      lowerHandDown=0;
    }else{
      if(peerStream!=undefined){
        peerConnections[peerUuid].pc.addStream(peerStream);
      }else{
        if(localStream != undefined && remoteStream==undefined){peerConnections[peerUuid].pc.addStream(localStream);}
        //add a media stream as the remoteStream if it is defined
        if(remoteStream!=undefined){peerConnections[peerUuid].pc.addStream(remoteStream);}
        
        //When a new peer comes then it sends its localstream and we don't want to set that local stream as remotestream and therefore increment first here
        if((remoteStream != undefined)&&(first==1)){ 
          first++; 
        };
      }
    }
     
  }

  //check if the message is for initiating the connection
  if (initCall) { 
    //create offer and call function to create sdp
    peerConnections[peerUuid].pc.createOffer().then(description => createdDescription(description, peerUuid)).catch(errorHandler);
    
  }
}

//  accepts as input an RTCPeerConnectionIceEvent object representing the icecandidate event
// delivers the ICE candidate to the remote peer through the signaling server. 
function gotIceCandidate(event, peerUuid) {
  
  if (event.candidate != null) {
    serverConnection.send(JSON.stringify({ 'ice': event.candidate, 'uuid': localUuid, 'dest': peerUuid , "time": time }));
    
    //messages to track the process of ice candidates exchange
    if (event && event.target && event.target.iceGatheringState === 'complete') {
      console.log('done gathering candidates - got iceGatheringState complete');
      
  } else if (event && event.candidate == null) {
      console.log('done gathering candidates - got null candidate');
      
  } else {
        console.log(event.target.iceGatheringState, event);   
  }
    
  }
}
//function to exchange sdp
function createdDescription(description, peerUuid) {
  console.log(`got description, peer ${peerUuid}`);
  peerConnections[peerUuid].pc.setLocalDescription(description).then(function () {
    serverConnection.send(JSON.stringify({ 'sdp': peerConnections[peerUuid].pc.localDescription, 'uuid': localUuid, 'dest': peerUuid , "time": time }));//send sdp to the peer 
  }).catch(errorHandler);
}


//function to create video element and set its attributes once got the remote stream from peer
function gotRemoteStream(event, peerUuid) {
  console.log(`got remote stream, peer ${peerUuid}`);

  //for peers reconnecting after churn
  if(count==1){
    console.log("count is one here")
    count=0;
    //create a HTMLDivElement
    var vidContainer = document.createElement('div');
    //create a video element
    var vidElement1 = document.createElement('video');
    //enable autoplay
    vidElement1.setAttribute('autoplay', '');
    //sets vidElement1 as event stream
    vidElement1.srcObject = event.streams[0]; 
     //sets peerStream as event stream
    peerStream=event.streams[0]
    //a new attribute is added with the specified name and value
    vidContainer.setAttribute('id', 'remoteVideo_' + peerUuid);

    //In case of peer churn delete all elements with videocntainer class except the first stream (own localstream) and only show elements with videocontainer1 class
    window.setTimeout(function(){
      var elements = document.getElementsByClassName("videoContainer");
      while(elements.length != 1){
          elements[1].parentNode.removeChild(elements[1]);
      }
      deleteVideoElement(peerUuid)
      updateLayout();
    }, 1000);


    vidContainer.setAttribute('class', 'videoContainer1');
    //append the video elements to the vidContainer
    vidContainer.appendChild(vidElement1);
    
    //append the label containing display name of the peer to vidContainer
    vidContainer.appendChild(makeLabel(peerConnections[peerUuid].displayName));

    document.getElementById('videos').appendChild(vidContainer);

    //send a message to the next peer prompting it to reconnect
    serverConnection.send(JSON.stringify({"churn": true, "uuid": String(DHT[3]), "time": time }));  

    //create a button on the video feed itself providing an option to delete it
    deleteVideoElement(peerUuid)
    updateLayout();
    

    }

    else{

    //create a HTMLDivElement
    var vidContainer = document.createElement('div'); 
    //create a video element
    vidElement = document.createElement('video'); 
    //enable autoplay
    vidElement.setAttribute('autoplay', '');
    
   /* defines source object for video element in different cases */
    //if new client
    if(first==0){ 
      vidElement.srcObject = event.streams[0]; //sets vidElement as event stream
      remoteStream = event.streams[0]; //sets remoteStream as event stream
      peerStream=remoteStream;
      first++;
    } 
    //if client requests to renew feed
    if(renewFeed==1){
      vidElement.srcObject = event.streams[0]
      renewFeed=0;
    }
    //enables master to view the feed of client requesting raise hand
    if(raiseHand == 1){
      vidElement.srcObject = event.streams[0]
      raiseHand=0;

    }
    //a new attribute is added with the specified name and value
    vidContainer.setAttribute('id', 'remoteVideo_' + peerUuid); 
    // append the two concurrent streams onto the empty array
    arr.push('remoteVideo_' + peerUuid) 

    //adds a new peer only if the peer is not already present in the meeting
    if(arr[0] != arr[1]){   
      vidContainer.setAttribute('class', 'videoContainer');

      //to ensure that one client gets only one feed
      if(vidContainer.childNodes.length === 0){
        //append the video element to the vidContainer
        vidContainer.appendChild(vidElement); 
        //append the label containing display name of the peer to vidContainer
        vidContainer.appendChild(makeLabel(peerConnections[peerUuid].displayName));
        document.getElementById('videos').appendChild(vidContainer);
        
        //create a button on the video feed itself providing an option to delete it
        deleteVideoElement(peerUuid);
        updateLayout();
      } 
    }else if(arr[0] == arr[1]){
      arr=[]
    }

  }
}


// function to check if peer disconnected on iceconnectionstatechange event
function checkPeerDisconnect(event, peerUuid) {
  //assign state the iceConnectionState of the specific peerUuid
  var state = peerConnections[peerUuid].pc.iceConnectionState; 
  console.log(`connection with peer ${peerUuid} ${state}`);
  //check if the connection is failed, closed or disconnected
  if (state === "failed" || state === "closed" || state === "disconnected") { 
    serverConnection.send(JSON.stringify({ uuid: peerUuid , 'state': "disconnected" , "time": time })); 
    //delete the peer details from the object peerConnections
    delete peerConnections[peerUuid];
    //remove the peer 
    document.getElementById('videos').removeChild(document.getElementById('remoteVideo_' + peerUuid)); 
    //update the layout on deletion
    updateLayout(); 
    if((flag!=0) && (raiseHandClient==0)){
      //identify the position of the disconnected peer in DHT
      var stopped;
      if(time < tThreshold){
        for(var i=0;i<DHT.length;i++){
          if(String(peerUuid)==String(DHT[i])){
            stopped = i;
            break
          }
        }
        //the peer succeeding the disconnected peer sends a message to the peer preceding the disconnected peer
        if(stopped<2){
          count=1;
          console.log("count is updated", DHT[0]);
          serverConnection.send(JSON.stringify({ 'displayName': localDisplayName, 'uuid': localUuid, 'dest1': String(DHT[0]), "time": time }));
          serverConnection.send(JSON.stringify({"reform": "3", "nextPeer": String(DHT[3]), "uuid" : String(DHT[0]), "time": time }));
          serverConnection.send(JSON.stringify({"reform": "1", "nextPeer": String(DHT[0]), "uuid" : localUuid, "time": time }));
        }
      }
    }else if(flag!=0){
        raiseHandClient==0;
      }
    

  }
}

 //function to update CSS grid based on number of diplayed videos
function updateLayout() {
 
  var rowHeight = '98vh';
  var colWidth = '98vw';

  var numVideos = Object.keys(peerConnections).length + 1 ; // add one to include local video

  if (numVideos > 1 && numVideos <= 4) { // 2x2 grid
    rowHeight = '48vh';
    colWidth = '48vw';
  } else if (numVideos > 4) { // 3x3 grid
    rowHeight = '32vh';
    colWidth = '32vw';
  }

  document.documentElement.style.setProperty(`--rowHeight`, rowHeight);
  document.documentElement.style.setProperty(`--colWidth`, colWidth);
}
//function to create the video label
function makeLabel(label) {
  var vidLabel = document.createElement('div');
  vidLabel.appendChild(document.createTextNode(label));
  vidLabel.setAttribute('class', 'videoLabel');
  return vidLabel;
}
// function to notify error
function errorHandler(error) {
  console.log(error);
}


// function to create unique id for a new peer
function createUUID() {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
  }

  return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
}

function downlinkspeed(){
  var arrTimes = [];
  var i = 0; // start
  var timesToTest = 5;
  var testImage = "http://www.google.com/images/phd/px.gif"; // small image in your server
  var dummyImage = new Image();
  var isConnectedFast = false;

  testLatency(function(avg){
    isConnectedFast = (avg <= tThreshold);
    /** output */
    document.body.appendChild(
      document.createTextNode("Time: " + (avg.toFixed(2)) + "ms - isConnectedFast? " + isConnectedFast)
      
    );
    console.log("Time: " + (avg.toFixed(2)) + "ms - isConnectedFast? " + isConnectedFast)
    time= avg.toFixed(2);
    time=parseInt(time);
    if(time > tThreshold){
      alert("You are running on low bandwidth. Click Renew Feed if stream stops.");
      
      // create a button for renewing feed
      var myDiv = document.getElementById("GFG");
      // creating button element  
      var button = document.createElement('BUTTON');
      button.setAttribute('id', "BUTTON"); 
      // creating text to be 
      //displayed on button 
      var text = document.createTextNode("Renew Feed"); 
      // appending text to button 
      button.appendChild(text); 
      // appending button to div 
      myDiv.appendChild(button);

      var renewButton = document.getElementById("BUTTON");
      renewButton.onclick = function(){
        serverConnection.send(JSON.stringify({"renew": true, "renewID": lowID, "time": time,'displayName': localDisplayName, 'uuid': localUuid, 'dest': 'all'}))
        renewFeed = 1;
        
      };
    }
      
  });

  /** test and average time took to download image from server, called recursively timesToTest times */
  function testLatency(cb) {
    var tStart = new Date().getTime();
    if (i<timesToTest-1) {
      dummyImage.src = testImage + '?t=' + tStart;
      dummyImage.onload = function() {
        var tEnd = new Date().getTime();
        var tTimeTook = tEnd-tStart;
        arrTimes[i] = tTimeTook;
        testLatency(cb);
        i++;
      };
    } else {
      /** calculate average of array items then callback */
      var sum = arrTimes.reduce(function(a, b) { return a + b; });
      var avg = sum / arrTimes.length;
      cb(avg);
    }
  }
}

//enables the client to remove an incoming feed
function deleteVideoElement(peerUuid){
  // creating button element 
  var deleteButton = document.getElementById('remoteVideo_' + peerUuid);
  deleteButton.onclick = function(){
    //confirms the deletion from the client and deletes the feed
    var answer = window.confirm("Are you sure you want to delete this video element ?");
    if (answer) {
      var elem = document.getElementById("remoteVideo_" + peerUuid);
      elem.parentNode.removeChild(elem);
      updateLayout();
    } 
  };
}

// creates a button for master to close a client's feed 
function closePeer(peerUuid){
  var myDiv = document.getElementById("GFG");
  // creating button element  
  var button = document.createElement('BUTTON');
  button.setAttribute('id', "closing"); 
  // creating text to be 
  //displayed on button 
  var text = document.createTextNode("Close Feed"); 
  // appending text to button 
  button.appendChild(text); 
  // appending button to div 
  myDiv.appendChild(button);
  var closeButton = document.getElementById("closing");
  closeButton.onclick = function(){
    peerConnections[peerUuid].pc.close()
    delete peerConnections[peerUuid];
    
  };

}
