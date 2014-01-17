$(init)

var info
var posted = false

function init(){
	$.getJSON('/mv.json?r=' + (Math.random() + '' + new Date().getTime()), onMVData)
	$('#form').submit(onSubmit)
	if(window.prev_anno == 'true'){
		var br = window.branch.split('_')
		br.pop()
		$('#prev-anno').append('<img src="http://SCREENSHOT_SERVER/screenshots/' + window.vid + '-' + br.join('_') + '.jpg" width="512" />')
	}
}

var t = new Date().getTime()

function onSubmit(e){
	if((new Date().getTime()) - t < 10000){
		alert("Please make sure you have completed the task before submitting.")
		e.preventDefault()
		return false
	}
	if(!posted){
		vScreen()
		$.get('/submit_task', {
			branch: info.branch,
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
	setTimeout(disconnect, 250)
	setTimeout(function() { $('#form').submit() }, 1000)
}

function onMVData(data){
	info = data
}

function vScreen(){
	$('#vnc')[0].takeScreenshot(window.vid, window.branch)
}

function disconnect(){
	$('#vnc')[0].disconnect()
}

function addDrawLayer(){
	$('#vnc')[0].addDrawLayer()
}

function removeDrawLayer(){
	$('#vnc')[0].removeDrawLayer()
}

function clearDrawLayer(){
	$('#vnc')[0].clearDrawLayer()
}