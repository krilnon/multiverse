var posted = false

$(init)

function init(){
	$('#form').submit(onSubmit)
}

function onSubmit(e){
	var val = $('input:radio[name=branch]:checked').val()
	if(!val){
		alert('You must select one of the options.')
		return false
	}
	if(!posted){
		$.get('/vote', {
			branch: val,
			assignmentId: getURLParams().assignmentId // validated on the server
		}, onSubmitComplete)
		e.preventDefault()
		return false
	}
	
	return true
}

function onSubmitComplete(){
	posted = true
	$('#form').submit()
}