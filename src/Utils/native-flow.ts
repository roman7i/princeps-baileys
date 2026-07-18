import type { proto } from '../../WAProto/index.js'
import type {
	NativeFlowQuickReplyParams,
	NativeFlowResponseInfo,
	NativeFlowSendableButton,
	NativeFlowSingleSelectParams,
	WAMessage,
	WAMessageContent
} from '../Types'

export const buildQuickReplyButton = (
	params: NativeFlowQuickReplyParams
): proto.Message.InteractiveMessage.NativeFlowMessage.INativeFlowButton => ({
	name: 'quick_reply',
	buttonParamsJson: JSON.stringify({
		display_text: params.display_text,
		id: params.id,
		disabled: params.disabled ?? false
	})
})

export const buildSingleSelectButton = (
	params: NativeFlowSingleSelectParams
): proto.Message.InteractiveMessage.NativeFlowMessage.INativeFlowButton => ({
	name: 'single_select',
	buttonParamsJson: JSON.stringify({
		title: params.title,
		button: params.button ?? 'Select',
		sections: params.sections.map(section => ({
			title: section.title,
			rows: section.rows.map(row => ({
				header: row.header ?? '',
				title: row.title,
				description: row.description ?? '',
				id: row.id
			}))
		}))
	})
})

export const buildNativeFlowButtons = (
	buttons: NativeFlowSendableButton[]
): proto.Message.InteractiveMessage.NativeFlowMessage.INativeFlowButton[] =>
	buttons.map(button => {
		switch (button.name) {
			case 'quick_reply':
				return buildQuickReplyButton(button.buttonParams)
			case 'single_select':
				return buildSingleSelectButton(button.buttonParams)
		}
	})

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		return value as Record<string, unknown>
	}
}

const readString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)

const unwrapMessageContent = (content: WAMessageContent | null | undefined): WAMessageContent | undefined => {
	if (!content) {
		return undefined
	}

	let current: WAMessageContent = content
	// Match normalizeMessageContent wrapper peeling without importing messages.ts (avoids cycles).
	for (let i = 0; i < 5; i++) {
		const inner = getFutureProofMessage(current)
		if (!inner?.message) {
			break
		}

		current = inner.message
	}

	return current

	function getFutureProofMessage(message: WAMessageContent) {
		return (
			message.ephemeralMessage ||
			message.viewOnceMessage ||
			message.documentWithCaptionMessage ||
			message.viewOnceMessageV2 ||
			message.viewOnceMessageV2Extension ||
			message.editedMessage ||
			message.associatedChildMessage ||
			message.groupStatusMessage ||
			message.groupStatusMessageV2
		)
	}
}

/**
 * Extracts a structured reply from an interactive native-flow response
 * (quick_reply / single_select clicks).
 */
export const parseNativeFlowResponse = (
	message: WAMessage | WAMessageContent | proto.IMessage | null | undefined
): NativeFlowResponseInfo | undefined => {
	const content =
		message && typeof message === 'object' && 'key' in message
			? unwrapMessageContent(message.message)
			: unwrapMessageContent(message ?? undefined)

	const nativeFlow = content?.interactiveResponseMessage?.nativeFlowResponseMessage
	if (!nativeFlow?.name) {
		return
	}

	let params: Record<string, unknown> = {}
	if (nativeFlow.paramsJson) {
		try {
			const parsed = JSON.parse(nativeFlow.paramsJson) as unknown
			params = asRecord(parsed) ?? {}
		} catch {
			params = {}
		}
	}

	const nested = asRecord(params.native_flow_response)
	const id =
		readString(params.id) ?? readString(nested?.id) ?? readString(params.selected_id) ?? readString(params.row_id)
	const displayText =
		readString(params.display_text) ??
		readString(params.title) ??
		readString(nested?.display_text) ??
		readString(nested?.title)

	return {
		name: nativeFlow.name,
		id,
		displayText,
		params,
		paramsJson: nativeFlow.paramsJson ?? undefined,
		version: typeof nativeFlow.version === 'number' ? nativeFlow.version : undefined
	}
}
