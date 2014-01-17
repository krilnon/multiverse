function vCopy(n){
	$('#vnc-' + n)[0].sendCopy()
}

function vPaste(n){
	$('#vnc-' + n)[0].sendPaste()
}

function vUndo(n){
	$('#vnc-' + n)[0].sendUndo()
}

function vScreen(n){
	$('#vnc-' + n)[0].takeScreenshot(window.vid, window.branches[n])
}

function disconnect(){
	for(var i = 0; i < window.branches.length; i++){
		$('#vnc-' + i)[0].disconnect()
	}
}

var t = new Date().getTime();

$(init)

var info
var posted = false

function init(){
	$.getJSON('mv.json', onMVData)
	$('#form').submit(onSubmit)
}

function onSubmit(e){
	if((new Date().getTime()) - t < 10000){
		alert("Please make sure you have completed the task before submitting.")
		e.preventDefault()
		return false
	}
	if(!posted){
		vScreen(0)
		$.get('/submit_merge', {
			branch: window.branches[0],
			assignmentId: getURLParams().assignmentId // validated on the server
		}, onSubmitComplete)
		e.preventDefault()
		return false
	}
	
	return true
}

function onSubmitComplete(){
	posted = true
	$('#submitBtn').prop('disabled', true)
	setTimeout(disconnect, 500)
	setTimeout(function(){ $('#form').submit() }, 1500)
}

function onMVData(data){
	info = data
}