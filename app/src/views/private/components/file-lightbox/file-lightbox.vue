<template>
	<v-dialog v-model="internalActive" @esc="internalActive = false">
		<template #activator="activatorBinding">
			<slot name="activator" v-bind="activatorBinding" />
		</template>

		<v-progress-circular v-if="loading" indeterminate />

		<file-preview
			v-else-if="file"
			:src="fileSrc"
			:mime="file.type"
			:width="file.width"
			:height="file.height"
			:title="file.title"
			in-modal
			@click="internalActive = false"
		/>

		<v-button class="close" icon rounded @click="internalActive = false">
			<v-icon name="close" />
		</v-button>
	</v-dialog>
</template>

<script lang="ts">
import { defineComponent, ref, watch, computed } from 'vue';
import api, { addTokenToURL } from '@/api';

import { nanoid } from 'nanoid';
import FilePreview from '@/views/private/components/file-preview';

import { getRootPath } from '@/utils/get-root-path';
import { unexpectedError } from '@/utils/unexpected-error';

type File = {
	type: string;
	width: number | null;
	height: number | null;
	title: string;
};

export default defineComponent({
	components: { FilePreview },
	props: {
		id: {
			type: String,
			required: true,
		},
		modelValue: {
			type: Boolean,
			default: undefined,
		},
	},
	emits: ['update:modelValue'],
	setup(props, { emit }) {
		const localActive = ref(false);

		const internalActive = computed({
			get() {
				return props.modelValue === undefined ? localActive.value : props.modelValue;
			},
			set(newActive: boolean) {
				localActive.value = newActive;
				emit('update:modelValue', newActive);
			},
		});

		const loading = ref(false);
		const file = ref<File | null>(null);
		const cacheBuster = ref(nanoid());

		const fileSrc = computed(() => {
			return addTokenToURL(getRootPath() + `assets/${props.id}?cache-buster=${cacheBuster.value}`);
		});

		watch(
			() => props.id,
			(newID, oldID) => {
				if (newID && newID !== oldID) {
					fetchFile();
				}
			},
			{ immediate: true }
		);

		return { internalActive, cacheBuster, loading, file, fileSrc };

		async function fetchFile() {
			cacheBuster.value = nanoid();

			loading.value = true;

			try {
				const response = await api.get(`/files/${props.id}`, {
					params: {
						fields: ['type', 'width', 'height', 'title'],
					},
				});

				file.value = response.data.data;
			} catch (err: any) {
				unexpectedError(err);
			} finally {
				loading.value = false;
			}
		}
	},
});
</script>

<style lang="scss" scoped>
.file-preview {
	width: 90%;
	max-width: initial;
	height: 90%;
	margin-bottom: 0;
}

.close {
	--v-button-background-color: var(--white);
	--v-button-color: var(--foreground-subdued);
	--v-button-background-color-hover: var(--white);
	--v-button-color-hover: var(--foreground-normal);

	position: absolute;
	top: 32px;
	right: 32px;
}
</style>
