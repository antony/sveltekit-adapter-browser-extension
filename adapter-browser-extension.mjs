import { join } from 'path'
import { writeFileSync, readFileSync, existsSync } from 'fs'
import glob from 'tiny-glob'
import sjcl from 'sjcl'
import cheerio from 'cheerio'
import { applyToDefaults } from '@hapi/hoek'

const manifest_filename = 'manifest.json'

function hash_script (s) {
	const hashed = sjcl.hash.sha256.hash(s);
	return sjcl.codec.base64.fromBits(hashed);
}

function generate_csp (html) {
	const $ = cheerio.load(html)
	const csp_hashes = $('script[type="module"]')
		.map((i, el) => hash_script($(el).get()[0].children[0].data))
		.toArray()
		.map(h => `'sha256-${h}'`)
		.join(' ')
	return `script-src 'self' ${csp_hashes}; object-src 'self'`
}

function generate_manifest (html, manifest_version) {
	const project_placeholders = {
		name: 'TODO',
		version: '0.1'
	}
	if (manifest_version === 2) {
		return {
			manifest_version: 2,
			browser_action: {
				default_title: 'SvelteKit',
				default_popup: 'index.html'
			},
			content_security_policy: generate_csp(html),
			...project_placeholders
		}
	}
	return {
		manifest_version: 3,
		action: {
			default_title: 'SvelteKit',
			default_popup: 'index.html'
		},
		content_security_policy: {
			"extension_pages": "script-src 'self'; object-src 'self'"
		},
		...project_placeholders
	}
}

function load_manifest () {
	if (existsSync(manifest_filename)) {
		return JSON.parse(readFileSync(manifest_filename, 'utf-8'))
	}

	return {}
}

// Quick and dirty helper function to externalize scripts. Will become obsolete once kit provides a config option to do this ahead of time.
function externalizeScript(html, assets) {
	return html.replace(
		/<script type="module" data-sveltekit-hydrate="([\s\S]+)">([\s\S]+)<\/script>/,
		(match, hydrationTarget, content) => {
			const hash = Buffer.from(hash_script(content), 'base64').toString('hex');
	         	const externalized_script_path = join(assets, `${hash}.js`);
			writeFileSync(externalized_script_path, content);
			return `<script type="module" data-sveltekit-hydrate="${hydrationTarget}" src="${hash}.js"></script>`;
		}
	);
}

/** @type {import('.')} */
export default function ({ pages = 'build', assets = pages, fallback, manifestVersion = 3 } = {}) {
	return {
		name: 'sveltekit-adapter-browser-extension',

		async adapt(builder) {
			if (!fallback && !builder.config.kit.prerender.default) {
				builder.log.warn(
					'You should set `config.kit.prerender.default` to `true` if no fallback is specified'
				);
			}


			const provided_manifest = load_manifest()

			builder.rimraf(assets)
			builder.rimraf(pages)

			builder.writeClient(assets)

			builder.writePrerendered(pages, { fallback });

			const index_page = join(assets, 'index.html')
			const index = readFileSync(index_page)
			
			/** The content security policy of manifest_version 3 does not allow for inlined scripts.
			Until kit implements a config option (#1776) to externalize scripts, the below code block should do 
			for a quick and dirty externalization of the scripts' contents **/
            		if (manifestVersion === 3) {
                		const HTML_files = await glob('**/*.html', { cwd: pages, dot: true, absolute: true, filesOnly: true })  
                		HTML_files.forEach(path => {
                    			let html = readFileSync(path, {encoding:'utf8'})
 					html = externalizeScript(html, assets)
        				writeFileSync(path, html)
            			});
            		}

			const generated_manifest = generate_manifest(index.toString(), manifestVersion)
			const merged_manifest = applyToDefaults(generated_manifest, provided_manifest, { nullOverride: true })

			writeFileSync(join(assets, manifest_filename), JSON.stringify(merged_manifest))
			builder.rimraf(join(assets, '_app'))
		}
	}
}
