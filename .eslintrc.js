/**
 * @file Eslint configuration.
 */

module.exports = {
	'env': {
		'commonjs': true,
		'es2021': true,
		'node': true,
	},
	'extends': 'eslint:recommended',
	'overrides': [
		{
			'env': {
				'node': true,
			},
			'files': [
				'**/*.{js,cjs,ejs}',
			],
			'parserOptions': {
				'sourceType': 'script',
			},
		},
	],
	'parserOptions': {
		'ecmaVersion': 'latest',
	},
	'plugins': [
		'jsdoc',
		'mocha',
	],
	'settings': {
		'jsdoc': {
			'tagNamePreference': {
				'todo': false,
				'extends': 'extends',
			},
		},
	},
	'rules': {
		'no-cond-assign': 'off',
		'space-in-parens': [
			'error',
			'never',
		],
		'indent': [
			'error',
			'tab',
			{ 'SwitchCase': 1 },
		],
		'keyword-spacing': [
			'error',
			{
				'before': true,
				'after': true,
			},
		],
		'linebreak-style': [
			'error',
			'unix',
		],
		'lines-around-comment': [
			'error',
			{
				'beforeLineComment': true,
				'allowBlockStart': true,
				'allowObjectStart': true,
			},
		],
		'brace-style': [
			'error',
		],
		'block-spacing': [
			'error',
		],
		'one-var-declaration-per-line': [
			'error',
		],
		'nonblock-statement-body-position': [
			'error',
			'beside',
		],
		'space-before-blocks': [
			'error',
			{
				'functions': 'always',
				'keywords': 'always',
				'classes': 'always',
			},
		],
		'no-trailing-spaces': [
			'error',
		],
		'curly': [
			'error',
		],
		'quotes': [
			'error',
			'single',
		],
		'semi': [
			'error',
			'always',
		],
		'comma-dangle': [
			'error',
			'always-multiline',
		],

		/*'require-atomic-updates': [
            'error',
        ],*/
		'no-unreachable-loop': [
			'error',
		],
		'no-unmodified-loop-condition': [
			'error',
		],
		'no-template-curly-in-string': [
			'error',
		],
		'no-promise-executor-return': [
			'error',
		],
		'no-new-native-nonconstructor': [
			'error',
		],
		'no-duplicate-imports': [
			'error',
		],
		'no-constructor-return': [
			'error',
		],
		'no-unused-vars': [
			'error',
			{
				destructuredArrayIgnorePattern: '^_',
				argsIgnorePattern: '^_',
				varsIgnorePattern: '^_',
				caughtErrorsIgnorePattern: '^_',
			},
		],
		'array-callback-return': [
			'error',
		],
		'no-self-compare': 1,
		'jsdoc/check-access': 1, // Recommended
		'jsdoc/check-alignment': 1, // Recommended
		// 'jsdoc/check-examples': 1,
		// 'jsdoc/check-indentation': 1,
		'jsdoc/check-line-alignment': 1,
		'jsdoc/check-param-names': 1, // Recommended
		'jsdoc/check-property-names': 1, // Recommended
		'jsdoc/check-syntax': 1,
		'jsdoc/check-tag-names': [
			'error',
			{
				definedTags: [
					'warning',
					'important',
					'danger',
					'note',
					'chainable',
				],
			},
		], // Recommended
		'jsdoc/check-types': 0, // Recommended
		'jsdoc/check-values': 1, // Recommended
		'jsdoc/empty-tags': 1, // Recommended
		'jsdoc/implements-on-classes': 1, // Recommended
		'jsdoc/informative-docs': 1,
		'jsdoc/match-description': 1,
		'jsdoc/multiline-blocks': 1, // Recommended
		'jsdoc/no-bad-blocks': 1,
		'jsdoc/no-blank-block-descriptions': 1,

		// 'jsdoc/no-defaults': 1,
		// 'jsdoc/no-missing-syntax': 2,
		'jsdoc/no-multi-asterisks': 1, // Recommended
		// 'jsdoc/no-restricted-syntax': 1,
		// 'jsdoc/no-types': 1,
		// 'jsdoc/no-undefined-types': 1, // Recommended
		'jsdoc/require-asterisk-prefix': 1,
		'jsdoc/require-description': [
			'error',
			{
				checkConstructors: false,
			},
		],

		// 'jsdoc/require-description-complete-sentence': 1,

		// 'jsdoc/require-example': 1,
		'jsdoc/require-file-overview': 1,
		'jsdoc/require-hyphen-before-param-description': 1,
		'jsdoc/require-param': 1, // Recommended
		'jsdoc/require-param-description': 1, // Recommended
		'jsdoc/require-param-name': 1, // Recommended
		'jsdoc/require-param-type': 1, // Recommended
		'jsdoc/require-property': 1, // Recommended
		'jsdoc/require-property-description': 1, // Recommended
		'jsdoc/require-property-name': 1, // Recommended
		'jsdoc/require-property-type': 1, // Recommended
		'jsdoc/require-returns': 1, // Recommended
		'jsdoc/require-returns-check': 1, // Recommended
		'jsdoc/require-returns-description': 1, // Recommended
		'jsdoc/require-returns-type': 1, // Recommended
		'jsdoc/require-throws': 1,
		'jsdoc/require-yields': 1, // Recommended
		'jsdoc/require-yields-check': 1, // Recommended
		// 'jsdoc/sort-tags': 1,
		'jsdoc/tag-lines': [
			'error',
			'any',
			{
				'startLines':1,
			},
		], // Recommended
		'jsdoc/valid-types': 1, // Recommended
	},
};