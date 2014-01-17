$(init)

var winner = [0]
var vid

function init(){
	$('#start-btn').click(start)
	$('#plus').click(add)
	$('#minus').click(remove)
	$('.mergeck').live('change', onCheckboxChange)
}

function start(e){
	$('#status-area').removeClass('hidden')
	$('#progress').attr('value', '1').attr('max', '5')
	$('#progress-text').text('Init…')
	
	$.post('/init', $('#vm-info').serialize(), copyComplete)
	
	$('input').prop('disabled', true)
	
	e.stopPropagation()
	return false
}

function copyComplete(e){
	console.log('response from multiverse', e)
	startThumbPolling(e)
	$('#progress').attr('value', '2')
	$('#progress-text').text('Working…')
}

function startThumbPolling(id){
	console.log('vid', id)
	vid = id
	console.log($('.step-thumbs').length)
	
	setInterval(winnerQuery, 5000)
	setInterval(thumbQuery, 5501)
}

function branchName(n, m){
	var a = []
	for(var i = 0; i < n + 1; i++){
		for(var j = 0; j < m; j++){
			
		}
	}
}

function thumbQuery(){
	
	for(i = 0; i < winner.length && i < $('.step-thumbs').length; i++){
		var thumbList = $($('.step-thumbs')[i]).children()
		for(var j = 0; j < thumbList.length; j++){
			thumbList[j].src = 'http://SCREENSHOT_SERVER/screenshots/' + vid + '-' + winner.concat().splice(0, i + 1).join('_') + '_' + j + '.jpg'
		}
	}
}

function winnerQuery(){
	$.post('/winner_query', null, onWinnerQueryResponse)
}

function onWinnerQueryResponse(res){
	if(res == 'none') return
	
	winner = res.split('_')
	for(var i = 0; i < winner.length; i++) winner[i] = parseInt(winner[i])
	
}

function add(e){
	var i = $('#instructions').children().length
	$('#instructions').append('<li class="instruction"><input type="text" name="instr-' + i + '" value=""/><input type="number" id="instr-' + i + '-branches" name="instr-' + i + '-branches" value="3" /> Annotate? <input type="checkbox" class="annotateck" name="instr-' + i + '-annotate" value="annotate" />, Merge? <input type="checkbox" class="mergeck" name="instr-' + i + '-type" value="merge" /><div class="merge-instr" id="instr-' + i + '-m-instrd" /><div class="step-thumbs" /></li>')
	$('#instr-' + i + '-branches').live('change', onBranchNumChange)
	$('#instr-' + i + '-branches').change()
}

function onCheckboxChange(e){
	var container = $(e.target.parentNode).children('.merge-instr')
	if($(e.target).prop('checked')){
		var name = container.attr('id').substring(0,  container.attr('id').length - 1)
		container.append('<label for="' + name + '-id">Merge instructions: </label><input type="text" id="' + name + '-id" name="' + name + '"/>')
	} else {
		container.children().remove()
	}
}

function onBranchNumChange(e){
	var container = $(e.target.parentNode).children('.step-thumbs').first()
	container.children().remove()
	for(var i = 0; i < parseInt(e.target.value); i++){
		container.append('<img src="http://SCREENSHOT_SERVER/screenshots/waiting.png" class="thumb" />')
	}
}

function remove(e){
	$('#instructions').children().last().remove()
}