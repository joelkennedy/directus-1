<template>
	<div class="v-dialog">
		<slot name="activator" v-bind="{ on: () => (internalActive = true) }" />

		<teleport to="#dialog-outlet">
			<transition-dialog @after-leave="leave">
				<div v-if="internalActive" class="container" :class="[className, placement]">
					<v-overlay active absolute @click="emitToggle" />
					<slot />
				</div>
			</transition-dialog>
		</teleport>
	</div>
</template>

<script lang="ts">
import { defineComponent, ref, computed } from 'vue';
import { nanoid } from 'nanoid';
import useShortcut from '@/composables/use-shortcut';
import { useDialogRouteLeave } from '@/composables/use-dialog-route';

export default defineComponent({
	props: {
		modelValue: {
			type: Boolean,
			default: undefined,
		},
		persistent: {
			type: Boolean,
			default: false,
		},
		placement: {
			type: String,
			default: 'center',
			validator: (val: string) => ['center', 'right'].includes(val),
		},
	},
	emits: ['esc', 'update:modelValue'],
	setup(props, { emit }) {
		useShortcut('escape', (event, cancelNext) => {
			if (internalActive.value) {
				emit('esc');
				cancelNext();
			}
		});

		const localActive = ref(false);

		const className = ref<string | null>(null);
		const id = computed(() => nanoid());

		const internalActive = computed({
			get() {
				return props.modelValue !== undefined ? props.modelValue : localActive.value;
			},
			set(newActive: boolean) {
				localActive.value = newActive;
				emit('update:modelValue', newActive);
			},
		});

		const leave = useDialogRouteLeave();

		return { emitToggle, className, nudge, leave, id, internalActive };

		function emitToggle() {
			if (props.persistent === false) {
				emit('update:modelValue', !props.modelValue);
			} else {
				nudge();
			}
		}

		function nudge() {
			className.value = 'nudge';

			setTimeout(() => {
				className.value = null;
			}, 200);
		}
	},
});
</script>

<style lang="scss" scoped>
.v-dialog {
	--v-dialog-z-index: 100;

	display: contents;
}

.container {
	position: fixed;
	top: 0;
	left: 0;
	z-index: 500;
	display: flex;
	width: 100%;
	height: 100%;
}

.container > :slotted(*) {
	z-index: 2;
	box-shadow: 0px 4px 12px rgb(38 50 56 / 0.1);
}

.container.center {
	align-items: center;
	justify-content: center;
}

.container.center.nudge > :slotted(*:not(:first-child)) {
	animation: nudge 200ms;
}

.container.right {
	align-items: center;
	justify-content: flex-end;
}

.container.right.nudge > :slotted(*:not(:first-child)) {
	transform-origin: right;
	animation: shake 200ms;
}

.container :slotted(.v-card) {
	--v-card-min-width: calc(100vw - 40px);
	--v-card-padding: 28px;
	--v-card-background-color: var(--background-page);
}

.container :slotted(.v-card) .v-card-title {
	padding-bottom: 8px;
}

.container :slotted(.v-card) .v-card-actions {
	flex-direction: column-reverse;
	flex-wrap: wrap;
}

.container :slotted(.v-card) .v-card-actions .v-button {
	width: 100%;
}

.container :slotted(.v-card) .v-card-actions .v-button .button {
	width: 100%;
}

.container :slotted(.v-card) .v-card-actions > .v-button + .v-button {
	margin-bottom: 20px;
	margin-left: 0;
}

.container :slotted(.v-sheet) {
	--v-sheet-padding: 24px;
	--v-sheet-max-width: 560px;
}

.container .v-overlay {
	--v-overlay-z-index: 1;
}

@media (min-width: 600px) {
	.container :slotted(.v-card) {
		--v-card-min-width: 540px;
	}

	.container :slotted(.v-card) .v-card-actions {
		flex-direction: inherit;
		flex-wrap: nowrap;
	}

	.container :slotted(.v-card) .v-card-actions .v-button {
		width: auto;
	}

	.container :slotted(.v-card) .v-card-actions .v-button .button {
		width: auto;
	}

	.container :slotted(.v-card) .v-card-actions > .v-button + .v-button {
		margin-bottom: 0;
		margin-left: 12px;
	}
}

@keyframes nudge {
	0% {
		transform: scale(1);
	}

	50% {
		transform: scale(1.02);
	}

	100% {
		transform: scale(1);
	}
}

@keyframes shake {
	0% {
		transform: scaleX(1);
	}

	50% {
		transform: scaleX(0.98);
	}

	100% {
		transform: scaleX(1);
	}
}
</style>
