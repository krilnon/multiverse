var mturk_user1 = {
	akey: 'AWS_ACCESS_KEY',
	skey: 'AWS_SECRET_KEY',
	control_reward: 1.00,
	merge_reward: 1.00,
	vote_reward: 0.50
}

var mturk_user2 = {
	akey: 'AWS_ACCESS_KEY',
	skey: 'AWS_SECRET_KEY',
	control_reward: 0.40,
	merge_reward: 1.00,
	vote_reward: 0.20
}

var config = {
	NAME_OF_COMPUTER_OR_CLUSTER: {
		host: 'External hostname for running Multiverse',
		port: 8080,
		vm_host: 'IP or domain of VM runner'
		vm_port: 6001,
		OS: 'X', // 'X' or 'windows'
		base_dir: 'PATH_TO_FOLDER_OF_VM_FOLDERS',
		default_vm: 'VM folder with a .vmx file inside',
		mturk: mturk_user1,
		turkit_path: 'PATH_TO_TURKIT.jar', // path to TurKit JAR
		mode: 'sandbox'
	}
}

module.exports = config