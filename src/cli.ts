#!/usr/bin/env node

import { gate } from './commands/gate.js'

const command = process.argv[2]

switch (command) {
	case 'install':
		console.log('install not implemented yet')
		break
	case 'gate':
		await gate()
		break
	case 'uninstall':
		console.log('uninstall not implemented yet')
		break
	case 'doctor':
		console.log('doctor not implemented yet')
		break
	default:
		console.error('Usage: qwizz <install|gate|uninstall|doctor>')
		process.exit(1)
}
