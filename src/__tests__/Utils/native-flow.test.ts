import type { MessageContentGenerationOptions, WAMessage } from '../../Types'
import { generateWAMessageContent } from '../../Utils/messages'
import {
	buildNativeFlowButtons,
	buildQuickReplyButton,
	buildSingleSelectButton,
	parseNativeFlowResponse
} from '../../Utils/native-flow'

const generationOptions = {
	upload: async () => ({
		mediaUrl: 'https://example.com',
		directPath: '/x',
		mediaKey: Buffer.alloc(32),
		fileEncSha256: Buffer.alloc(32),
		fileSha256: Buffer.alloc(32),
		fileLength: 0
	})
} as MessageContentGenerationOptions

describe('native-flow builders', () => {
	it('builds a quick_reply button with display_text and id', () => {
		const button = buildQuickReplyButton({ display_text: 'Yes', id: 'yes' })
		expect(button.name).toBe('quick_reply')
		expect(JSON.parse(button.buttonParamsJson!)).toEqual({
			display_text: 'Yes',
			id: 'yes',
			disabled: false
		})
	})

	it('builds a single_select button with sections and rows', () => {
		const button = buildSingleSelectButton({
			title: 'Menu',
			button: 'Open',
			sections: [
				{
					title: 'A',
					rows: [{ title: 'Option 1', id: 'opt1', description: 'desc' }]
				}
			]
		})
		expect(button.name).toBe('single_select')
		expect(JSON.parse(button.buttonParamsJson!)).toEqual({
			title: 'Menu',
			button: 'Open',
			sections: [
				{
					title: 'A',
					rows: [{ header: '', title: 'Option 1', description: 'desc', id: 'opt1' }]
				}
			]
		})
	})

	it('maps a mixed nativeFlowButtons list', () => {
		const buttons = buildNativeFlowButtons([
			{ name: 'quick_reply', buttonParams: { display_text: 'Ok', id: 'ok' } },
			{
				name: 'single_select',
				buttonParams: {
					title: 'Pick',
					sections: [{ title: 'S', rows: [{ title: 'R', id: 'r1' }] }]
				}
			}
		])
		expect(buttons).toHaveLength(2)
		expect(buttons[0]!.name).toBe('quick_reply')
		expect(buttons[1]!.name).toBe('single_select')
	})
})

describe('generateWAMessageContent native flow', () => {
	it('creates interactiveMessage.nativeFlowMessage from nativeFlowButtons', async () => {
		const content = await generateWAMessageContent(
			{
				text: 'Choose',
				footer: 'Footer',
				title: 'Header',
				nativeFlowButtons: [{ name: 'quick_reply', buttonParams: { display_text: 'Go', id: 'go' } }]
			},
			generationOptions
		)

		const interactive = content.interactiveMessage
		expect(interactive?.body?.text).toBe('Choose')
		expect(interactive?.footer?.text).toBe('Footer')
		expect(interactive?.header?.title).toBe('Header')
		expect(interactive?.nativeFlowMessage?.buttons).toHaveLength(1)
		expect(interactive?.nativeFlowMessage?.buttons?.[0]?.name).toBe('quick_reply')
		expect(content.viewOnceMessage).toBeFalsy()
		expect(content.listMessage).toBeFalsy()
		expect(content.buttonsMessage).toBeFalsy()
	})

	it('rejects an empty nativeFlowButtons array', async () => {
		await expect(
			generateWAMessageContent(
				{
					text: 'Choose',
					nativeFlowButtons: []
				},
				generationOptions
			)
		).rejects.toMatchObject({ output: { statusCode: 400 } })
	})
})

describe('parseNativeFlowResponse', () => {
	it('parses a quick_reply response from WAMessage', () => {
		const msg: WAMessage = {
			key: { remoteJid: '123@s.whatsapp.net', fromMe: false, id: 'ABC' },
			message: {
				interactiveResponseMessage: {
					nativeFlowResponseMessage: {
						name: 'quick_reply',
						paramsJson: JSON.stringify({ id: 'yes', display_text: 'Yes' }),
						version: 3
					}
				}
			}
		}

		expect(parseNativeFlowResponse(msg)).toEqual({
			name: 'quick_reply',
			id: 'yes',
			displayText: 'Yes',
			params: { id: 'yes', display_text: 'Yes' },
			paramsJson: JSON.stringify({ id: 'yes', display_text: 'Yes' }),
			version: 3
		})
	})

	it('parses a single_select response using title as displayText', () => {
		const content = {
			interactiveResponseMessage: {
				nativeFlowResponseMessage: {
					name: 'single_select',
					paramsJson: JSON.stringify({ id: 'opt1', title: 'Option 1' })
				}
			}
		}

		expect(parseNativeFlowResponse(content)).toMatchObject({
			name: 'single_select',
			id: 'opt1',
			displayText: 'Option 1'
		})
	})

	it('returns undefined when message has no native flow response', () => {
		expect(parseNativeFlowResponse({ conversation: 'hi' })).toBeUndefined()
		expect(parseNativeFlowResponse(undefined)).toBeUndefined()
	})

	it('unwraps ephemeral wrappers before parsing', () => {
		const msg: WAMessage = {
			key: { remoteJid: '123@s.whatsapp.net', fromMe: false, id: 'ABC' },
			message: {
				ephemeralMessage: {
					message: {
						interactiveResponseMessage: {
							nativeFlowResponseMessage: {
								name: 'quick_reply',
								paramsJson: JSON.stringify({ id: 'x', display_text: 'X' })
							}
						}
					}
				}
			}
		}

		expect(parseNativeFlowResponse(msg)?.id).toBe('x')
	})
})
