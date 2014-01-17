var wrench = require('wrench'),
	formidable = require('formidable'),
	static = require('node-static'),
	mustache = require('mustache'),
	util = require('util'),
	http = require('http'),
	net = require('net'),
	fs = require('fs'),
	url = require('url'),
	exec = require('child_process').exec,
	querystring = require('querystring')
	
var config = require('./config').openstack

// ---------------------------------

var slash = config.OS == 'X' ? '/' : '\\'
var newline = config.OS == 'X' ? '\n' : '\r'
var dir = new (static.Server)('./public_web')

var mv_info
var response
var total_votes = 0
var time
var coolTime = 10000 // time to wait before cloning a recently-suspended VM
var recent_winner
var start_times = {}
var end_times = []
var cost = 0
var costs = []

var pages = {
	'': { // start page, for the end user
		template: 'index.m.html',
		handler: function(req){
			var params = url.parse(req.url, true).query
			return {
				config: config
			}
		}
	},
	
	control_task: {
		template: 'control_task.m.html',
		handler: function(req){
			var params = url.parse(req.url, true).query
			console.log(util.inspect(params))
			console.log('instr:', params.instr)
			recordTaskStart(params.assignmentId)
			
			var anno_html = ''
			var button_html = ''
			if(params.anno == 'true'){
				anno_html = '\
					<p>Click on the marker button when you are ready to switch to drawing mode.  In this \
					mode, you must draw over the window to complete the task.</p>\
				'
				button_html = '\
				<p><input type="button" value="Start Drawing" onclick="addDrawLayer()" /></p>\
				'
			}
			
			var prev_anno = 'false'
			if(params.prev_anno == 'true'){
				prev_anno = 'true'
			}
			
			return {
				hitId: params.hitId,
				assignmentId: params.assignmentId,
				workerId: params.workerId,
				id: params.id,
				branch: params.branch,
				instr: params.instr,
				anno: params.anno,
				prev_anno: prev_anno,
				anno_html: anno_html,
				button_html: button_html,
				config: config
			}
		}
	},
	
	merge_task: {
		template: 'merge_task.m.html',
		handler: function(req){
			var params = url.parse(req.url, true).query
			recordTaskStart(params.assignmentId)
			return {
				hitId: params.hitId,
				assignmentId: params.assignmentId,
				workerId: params.workerId,
				id: params.id,
				instr: params.instr,
				branches: params.branches,
				config: config
			}
		}
	},
	
	vote_task: {
		template: 'vote_task.m.html',
		handler: function(req){
			var params = url.parse(req.url, true).query
			var _branches = params.branches.split(',')
			
			var vote_html = ''
			for(var i = 0; i < _branches.length; i++){
				var br = _branches[i]
				// TODO: Implement screenshot server for public repo.
				vote_html += '\
					<td class="screenshot-td">\
						<label for="' + br + '">\
							<img src="http://SCREENSHOT_SERVER/screenshots/' + params.id + '-' + br + '.jpg" />\
						</label>\
						<input type="radio" class="radio-button" name="branch" id="' + br + '" value="' + br + '" />\
					</td>'
				
			}
			
			recordTaskStart(params.assignmentId)
			return {
				hitId: params.hitId,
				assignmentId: params.assignmentId,
				workerId: params.workerId,
				id: params.id,
				branches: params.branch,
				instr: params.instr,
				config: config,
				vote_html: vote_html
			}
		}
	}
}

/*
	The start page for Multiverse is http://host:port
*/
var server = http.createServer(function(req, res){
	var url_parts = url.parse(req.url)
	var page_name = url_parts.pathname.substring(1)
	if(req.url == '/init'){
		var form = new formidable.IncomingForm
		var fields = {}
		
		form
			.on('error', function(err){
				res.writeHead(200, {'content-type': 'text/plain' })
				res.end('{ "error": "' + util.inspect(err) + '" }')
			})
			.on('field', function(field, value){
				console.log('got field', field, value)
				fields[field] = value
			})
			.on('end', function(){
				console.log('finished form')
				mv_info = fields
				
				time = new Date().getTime()
				
				if(res){
					res.writeHead(200, {'content-type': 'text/plain'})
					res.end('v' + time) // send id info to form.html
				}
				
				initMultiverse()
			})
		form.parse(req)
	} else if(req.url == '/winner_query'){
		if(recent_winner){
			res.writeHead(200, {'content-type': 'text/plain'})
			res.end(recent_winner.path.join('_'))
		} else {
			res.writeHead(200, {'content-type': 'text/plain'})
			res.end('none')
		}
	} else if(url.parse(req.url).pathname == '/submit_task'){
		var parts = url.parse(req.url, true)
		var aID = parts.query.assignmentId
		if(!aID || aID == '' || aID == 'ASSIGNMENT_ID_NOT_AVAILABLE'){
			console.log(parts.query)
			rejectRequest(aID, res)
			return
		}
		recordTaskEnd(aID, 'control')
		var _branch = branchFromPathString(parts.query.branch)
		
		console.log('submit_task', _branch)
		
		__vmrun(config.base_dir + slash + _branch.dir + slash + mv_info.vmx_name, 'suspend', ['hard'])	
		setTimeout(nextActionAfter, coolTime, _branch)
		
		if(res){
			res.writeHead(200, {'content-type': 'text/plain'})
			res.end('v' + time)
		}
		
	} else if(url.parse(req.url).pathname == '/submit_merge'){
		parts = url.parse(req.url, true)
		console.log('submit_merge branch string', parts.query.branch)
		
		var aID = parts.query.assignmentId
		if(!aID || aID == '' || aID == 'ASSIGNMENT_ID_NOT_AVAILABLE'){
			rejectRequest(aID, res)
			return
		}
		recordTaskEnd(aID, 'merge')
		
		_branch = branchFromPathString(parts.query.branch)
		
		console.log('submit_merge', _branch)
		
		var branches = siblingsOf(_branch)
		for(var i = 0; i < branches.length; i++){
			__vmrun(config.base_dir + slash + branches[i].dir + slash + mv_info.vmx_name, 'suspend', ['hard'])
		}
		
		var merged = branches[0]
		// if the path is as long as instrs, then all instructions have been completed
		if(merged.path.length - 1 == mv_info.instrs.length){
			// then this is the overall winner!
			console.log('winner!-------------------->', merged)
			if(res){
				res.writeHead(200, {'content-type': 'text/plain'})
				res.end('Success')
			}
			end(merged)
		} else {
			// there are more instructions to go
			setTimeout(branch, coolTime, merged, mv_info.branch_counts[merged.path.length - 1])
		}
		
		if(res){
			res.writeHead(200, {'content-type': 'text/plain'})
			res.end('v' + time) // send id info to form.html
		}
	} else if(url.parse(req.url).pathname == '/vote'){
		parts = url.parse(req.url, true)
		
		var aID = parts.query.assignmentId
		if(!aID || aID == '' || aID == 'ASSIGNMENT_ID_NOT_AVAILABLE'){
			rejectRequest(aID, res)
			return
		}
		recordTaskEnd(aID, 'vote')
		
		_branch = branchFromPathString(parts.query.branch)
		_branch.votes++
		total_votes++
		
		console.log('vote for', _branch)
		
		res.writeHead(200, {'content-type': 'text/plain'})
		res.end('Vote received.')
		
		if(total_votes == mv_info.voteCount){
			console.log('end of round')
			determineRoundWinner(siblingsOf(_branch))
		}
	} else if(pages[page_name]){ // apply a mustache template
		res.writeHead(200, { 'Content-type': 'text/html' })
		res.end(generatePage(page_name, req))
	} else {
		dir.serve(req, res)
	}
})
server.listen(config.port)

function initMultiverse(){
	mv_info.time = time
	mv_info.verse_dir = 'v' + time
	var time_dir = config.base_dir + slash + mv_info.verse_dir
	fs.mkdirSync(time_dir, 511)
	
	// instructions come in as 'instr-[n]' form values.  this populates an array instead
	var instrs = []
	mv_info.instrs = instrs
	var branch_counts = []
	mv_info.branch_counts = branch_counts
	var types = []
	mv_info.types = types
	var merge_instrs = []
	mv_info.merge_instrs = merge_instrs
	var anno_instrs = []
	mv_info.anno_instrs = anno_instrs
	
	var n = 0
	while(mv_info['instr-' + n]){
		instrs.push(mv_info['instr-' + n])
		
		// also handle instr-n-type and instr-n-branches
		branch_counts.push(parseInt(mv_info['instr-' + n + '-branches']))
		
		var type = mv_info['instr-' + n + '-type']
		if(type && type == 'merge'){
			types.push(type)
			merge_instrs[n] = mv_info['instr-' + n + '-m-instr']
		} else {
			types.push('vote')
		}
		
		var anno = mv_info['instr-' + n + '-annotate']
		if(anno && anno == 'annotate'){
			anno_instrs[n] = true
		}
		
		n++
	}
	
	console.log('branchCounts', branch_counts)
	console.log('types', types)
	console.log('m-instrs', merge_instrs)
	
	mv_info.winners = [0]
	
	
	// convert some relevant form values to ints
	mv_info.voteCount = parseInt(mv_info.voteCount)
	//mv_info.branchCount = parseInt(mv_info.branchCount)
	
	initBranches()
	
	// branch
	branch(mv_info.branches[0], mv_info.branch_counts[0])
	
}

/*
	Uses Mustache to template HTML pages.  This replaces the PHP that used to do this.
*/
function generatePage(name, req){
	var page = pages[name]
	return mustache.to_html(fs.readFileSync(page.template, 'utf8'), page.handler(req))
}

function postJSON(obj){
	var data = JSON.stringify(obj)
	fs.writeFileSync('public_web' + slash + 'mv.json', data)
}

function rejectRequest(aid, res){
	console.log('! -- Invalid assignment attempted submit:', aid)
	if(res){
		res.writeHead(200, {'content-type': 'text/plain'})
		res.end('200')
	}
}

function recordTaskStart(aid){
	if(!aid || aid == '' || aid == 'ASSIGNMENT_ID_NOT_AVAILABLE'){
		return
	}
	var d = new Date
	start_times[aid] = d
	console.log('Task start (' + aid + ') at ' + d + ', [' + d.getTime() + ']')
}

function recordTaskEnd(aid, type){
	var st = start_times[aid]
	if(!aid || aid == '' || aid == 'ASSIGNMENT_ID_NOT_AVAILABLE' || !st){
		console.log('Could not record task end time for assignment: ', aid)
		return
	}
	
	var et = new Date
	var timeInfo = {
		type: type,
		startTime: st,
		endTime: et,
		duration: (et.getTime() - st.getTime())
	}
	end_times.push(timeInfo)
	console.log(type + ' task ended, assignment ' + aid + ' took ' + (timeInfo.duration / 1000) + 'sec')
}

function initBranches(){
	mv_info.branches = [{
		name: 'branch_0',
		num: 0,
		path: [0],
		dir: mv_info.vmfile,
		votes: 0
	}]
}

// copy the .vmwarevm in baseBranch, and make a VM branch in the verses/v1234timestamp folder
function branch(baseBranch, numBranches){
	var count = 0
	
	// update recent_winner for updating the interface
	recent_winner = baseBranch
	
	baseBranch.branches = []
	for(var i = 0; i < numBranches; i++){
		var name = baseBranch.name + '_' + i
		var branchDir = mv_info.verse_dir + slash + name + (config.OS == 'X' ? '.' : '_') + 'vmwarevm'
		baseBranch.branches.push({
			name: name,
			num: i,
			path: baseBranch.path.concat([i]),
			dir: branchDir,
			votes: 0
		})
		
		console.log('starting copy of ' + baseBranch.dir + ' to ' + branchDir)
		var copyCommand = config.OS == 'X' ? 'cp -r ' : 'xcopy /E /I ' // 
		var child = exec(copyCommand + (config.base_dir + slash + baseBranch.dir) + ' ' + (config.base_dir + slash + branchDir), 
			function(err, stdo, stde){
				count++
				console.log('single copy complete')
				if(count == numBranches) onBranchCopyingComplete(baseBranch.branches)
			}
		)
	}
}

/*
	After one branch is submitted, a couple things could happen:
		- start the next branch
		- start voting on a set of sibling branches
		- start a merging process on a set of sibling branches
	
	This function figures out which is next and starts that process.
*/
function nextActionAfter(branch){
	var len = branch.path.length
	if(branch.path[len - 1] < mv_info.branch_counts[branch.path.length - 2] - 1){
		// still some branches left
		var nextPath = branch.path.concat([])
		nextPath[len - 1]++
		initHitForBranch(branchFromPath(nextPath))
	} else {
		console.log('decided between vote and merge:', mv_info.types[len - 2])
		if(mv_info.types[len - 2] == 'merge'){
			startMerge(siblingsOf(branch))
		} else { // time to vote
			total_votes = 0
			startVotingOn(siblingsOf(branch)) // this is a list of all branches in the next vote
		}
	}
}

/*
	Count votes for a set of sibling branches, and branch the winner.
	TODO: What about ties? (right now it'll pick the earlier branch by default)
*/
function determineRoundWinner(branches){
	var winner = branches[0]
	for(var i = 0; i < branches.length; i++){
		if(branches[i].votes > winner.votes) winner = branches[i]
	}
	
	// if the path is as long as instrs, then all instructions have been completed
	if(winner.path.length - 1 == mv_info.instrs.length){
		// then this is the overall winner!
		console.log('winner!-------------------->', winner)
		end(winner)
	} else {
		// there are more instructions to go
		branch(winner, mv_info.branch_counts[winner.path.length - 2])
	}
}

/*
	get siblings for a branch, INCLUDING that branch itself
*/
function siblingsOf(branch){
	var parentPath = branch.path.concat([]) // just a clone
	parentPath.pop() // remove one element
	return branchFromPath(parentPath).branches
}

/*
	Given a set of branches, post a new task to merge them.
*/
function startMerge(branches){
	// ready the branches
	var branchList = []
	
	for(var i = 0; i < branches.length; i++){
		branchList.push(branches[i].path.join('_'))
	}
	
	for(var i = 0; i < branches.length; i++){
		var branch = branches[i]
		modifyVMX(branch, function(vmx){
			console.log('setting merge VM port: ', (config.vm_port + i))
			return vmx.replace(new RegExp('RemoteDisplay.vnc.port.*' + newline), 'RemoteDisplay.vnc.port = "' + (config.vm_port + i) + '"' + newline)
		})
		
		// un-suspend
		var path = config.base_dir + slash + branch.dir + slash + mv_info.vmx_name
		__vmrun(path, 'start', ['nogui'])
		
	}
	
	// post merging task to MTurk
	var json = JSON.stringify({
		title : 'Copy and paste items between several on-screen computers. ' + mv_info.time,
		desc : 'Follow task-specific instructions to copy and paste items into one computer',
		keywords: "copy and paste, remote computing",
		url : config.host + '/merge_task?branches=' + (branchList.join(',')) + '&id=' + mv_info.verse_dir + '&instr=' + encodeURI(mv_info.merge_instrs[branches[0].path.length - 2]),
		height : 1000,
		reward : config.mturk.merge_reward,
		assignmentDurationInSeconds: 720,
		autoApprovalDelayInSeconds: 72000,
		maxAssignments: 1
	})
	
	addCost(config.mturk.merge_reward, 1, 'merge')
	
	var turkit_js = 'var hitId = mturk.createHITRaw(' + json + ')'
	var dir = config.base_dir + slash + branches[0].dir
	var filename = dir + slash + branches[0].name + '_merge_code.js'
	fs.writeFileSync(filename, turkit_js)
	
	var turkit = __TurKit({ codePath: filename }, function(err, stdo, stde){
		console.log('turkit merging process', stdo, stde)
	})
}

function startVotingOn(branches){
	var branchList = []
	
	for(var i = 0; i < branches.length; i++){
		branchList.push(branches[i].path.join('_'))
	}
	
	var json = JSON.stringify({
		title : 'Pick the screenshot which most accurately reflects the instruction. ' + mv_info.time,
		desc : 'Compare the screenshots and pick the one that has best followed the instructions',
		keywords: "voting, screenshot, options, picking, quality",
		url : config.host + '/vote_task?branches=' + (branchList.join(',')) + '&id=' + mv_info.verse_dir + '&instr=' + encodeURI(mv_info.instrs[branches[0].path.length - 2]),
		height : 1000,
		reward : config.mturk.vote_reward,
		assignmentDurationInSeconds: 720,
		autoApprovalDelayInSeconds: 72000,
		maxAssignments: mv_info.voteCount // this may let the same person vote > once
	})
	
	addCost(config.mturk.vote_reward, mv_info.voteCount, 'vote')
	
	/*
		Note: The TurKit JS files are placed in the 0th branch's folder. 
		It might make more sense to put them in the parent, but it shouldn't matter much.
	*/
	
	var turkit_js = 'var hitId = mturk.createHITRaw(' + json + ')'
	var dir = config.base_dir + slash + branches[0].dir
	var filename = dir + slash + branches[0].name + '_vote_code.js'
	fs.writeFileSync(filename, turkit_js)
	
	var turkit = __TurKit({ codePath: filename }, function(err, stdo, stde){
		console.log('turkit voting process', stdo, stde)
	})
}

// gets a branch from an Array.<int> of branch tree child indices
function branchFromPath(path){
	var current = mv_info
	for(var i = 0; i < path.length; i++){
		try {
			current = current.branches[path[i]]
		} catch(err){
			throw 'Invalid branch path supplied: ' + path.join('_')
		}
	}
	return current
}

// pathString looks like "0_3_1" for example.  returns the [0, 3, 1] branch
function branchFromPathString(pathString){
	var path = pathString.split('_')
	for(var i = 0; i < path.length; i++){
		path[i] = parseInt(path[i])
	}
	return branchFromPath(path)
}

function onBranchCopyingComplete(newBranches){
	modifyBranchDirs(newBranches)
	initHitForBranch(newBranches[0])
}


function __TurKit(options, processCallback){
	var turkit = exec('java -jar ' + config.turkit_path + ' -a ' + config.mturk.akey + ' \
	-f ' + options.codePath + ' -h 1 -m ' + config.mode + ' -o 30.00 \
	-s ' + config.mturk.skey, processCallback)
	return turkit
}

function __vmrun(vmxPath, command, options){
	console.log('vmrun -T player ' + command + ' ' + vmxPath + ' ' + options.join(' '))
	var vm = exec('vmrun -T player ' + command + ' ' + vmxPath + ' ' + options.join(' '),
		function(err, stdo, stde){
			console.log('vmrun info: ', err, stdo, stde)
		}
	)
}

function initHitForBranch(branch){
	var instr_index = branch.path.length - 2
	var has_anno = (mv_info.anno_instrs[instr_index] === true).toString()
	var prev_anno = 'false'
	if(instr_index - 1 >= 0){
		prev_anno = (mv_info.anno_instrs[instr_index - 1] === true).toString()
	}
	var json = JSON.stringify({
		title : 'Control a  remote computer to complete a quick task. ' + mv_info.time,
		desc : 'Read the assignment-specific instructions and complete them within the onscreen computer',
		keywords: "control",
		url : config.host + '/control_task?branch=' + branch.path.join('_') + '&id=' + mv_info.verse_dir + '&anno=' + has_anno + '&prev_anno=' + prev_anno  + '&instr=' + encodeURI(mv_info.instrs[instr_index]),
		height : 1000,
		reward : config.mturk.control_reward,
		assignmentDurationInSeconds: 720,
		autoApprovalDelayInSeconds: 72000,
		maxAssignments: 1
	})
	
	addCost(config.mturk.control_reward, 1, 'control')
	
	var turkit_js = 'var hitId = mturk.createHITRaw(' + json + ')'
	var dir = config.base_dir + slash + branch.dir
	fs.writeFileSync(dir + slash + branch.name + '_code.js', turkit_js)
	
	var turkit = __TurKit({ codePath: dir + '/' + branch.name + '_code.js' }, function(err, stdo, stde){
		console.log('turkit process', stdo, stde)
	})
	
	postJSON({
		branch: branch.path.join('_')
	})
	
	__vmrun(config.base_dir + slash + branch.dir + slash + mv_info.vmx_name, 'start', ['nogui'])
}

//changes .vmx so VM runs properly
function modifyBranchDirs(newBranches){
	for(var i = 0; i < newBranches.length; i++){
		var branch = newBranches[i]
		var dir = config.base_dir + slash + branch.dir
		var files = fs.readdirSync(dir)
		for(var j = 0; j < files.length; j++){
			if(files[j].match(/\.vmx$/)){
				var file = files[j]
				//console.log('found: ' + file)
				mv_info.vmx_name = file
				break
			}
		}
		if(file){
			console.log('reading ' + dir + slash + file)
			var vmx = fs.readFileSync(dir + slash + file, 'utf8')
			vmx = vmx.replace(new RegExp('displayName.*' + newline), 'displayName = "' + branch.name + '"' + newline)
			vmx = vmx.replace(new RegExp('RemoteDisplay.vnc.port.*' + newline), 'RemoteDisplay.vnc.port = "' + config.vm_port + '"' + newline)
			if(vmx.indexOf('autoAnswer') == -1) vmx = vmx + "msg.autoAnswer = TRUE" + newline
			fs.writeFileSync(dir + slash + file, vmx)
		}
	}
}

function modifyVMX(branch, callback){
	var dir = config.base_dir + slash + branch.dir
	var files = fs.readdirSync(dir)
	for(var j = 0; j < files.length; j++){
		if(files[j].match(/\.vmx$/)){
			var file = files[j]
			mv_info.vmx_name = file
			break
		}
	}
	if(file){
		console.log('reading ' + dir + slash + file)
		var vmx = fs.readFileSync(dir + slash + file, 'utf8')
		vmx = callback(vmx)
		fs.writeFileSync(dir + slash + file, vmx)
	}
}

function addCost(amount, numAssignments, type){
	costs.push({ amount: amount, numAssignments: numAssignments, type: type })
	cost += amount * numAssignments
	console.log('offering $' + (amount * numAssignments) + ' total for ' + numAssignments + ' assignments')
}

// this is called when a final branch has been selected/elected
function end(winning_branch){
	logTimeStats()
	logCostStats()
	
	console.log('Finished, exiting now...')
	process.exit(0)
}

function logTimeStats(){
	console.log('')
	console.log('------- Times --------')
	var current = new Date().getTime()
	var overall = current - mv_info.time
	console.log('Overall:   ', overall / 1000, ' seconds')
	
	var control_duration = 0
	var control_count = 0
	var merge_duration = 0
	var merge_count = 0
	var vote_duration = 0
	var vote_count = 0
	var task_duration = 0
	for(var i = 0; i < end_times.length; i++){
		var t = end_times[i]
		task_duration += t.duration
		switch(t.type){
			case 'control':
				control_duration += t.duration
				control_count++
				break
			case 'merge':
				merge_duration += t.duration
				merge_count++
				break
			case 'vote':
				vote_duration += t.duration
				vote_count++
				break
		}
	}
	
	console.log('Aggregate worker task time: ', task_duration / 1000, 'seconds')
	console.log('Avg. control task duration: ', ((control_duration / control_count) / 1000), 'seconds')
	console.log('Avg. merge task duration: ', ((merge_duration / merge_count) / 1000), 'seconds')
	console.log('Avg. vote task duration: ', ((vote_duration / vote_count) / 1000), 'seconds')
	console.log('----------------------')
	console.log('')
}

function logCostStats(){
	console.log('------- Costs --------')
	console.log('Total: $' + cost)
	
	for(var i = 0; i < costs.length; i++){
		var c = costs[i]
		console.log(c.type, c.numAssignments + ' assmnts', '$' + c.amount)
	}
	
	console.log('----------------------')
	console.log('')
	
}