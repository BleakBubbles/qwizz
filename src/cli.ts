#!/usr/bin/env node

const command = process.argv[2];

switch (command) {
	case 'install':
		console.log('install not implemented yet');
		break;
	case 'gate':
		console.log('gate not implemented yet');
		break;
	case 'uninstall':
		console.log('uninstall not implemented yet');
		break;
	case 'doctor':
		console.log('doctor not implemented yet');
		break;
	default:
		console.error('Usage: quiz-commit <install|gate|uninstall|doctor>');
		process.exit(1);
}
