import api from '@/api';
import { useCollection } from '@directus/shared/composables';
import { formatISO, parse, format } from 'date-fns';
import { useItems } from '@directus/shared/composables';
import { router } from '@/router';
import { useAppStore } from '@/stores/app';
import { getFieldsFromTemplate } from '@directus/shared/utils';
import getFullcalendarLocale from '@/utils/get-fullcalendar-locale';
import { renderPlainStringTemplate } from '@/utils/render-string-template';
import { unexpectedError } from '@/utils/unexpected-error';
import { Field, Item } from '@directus/shared/types';
import { defineLayout } from '@directus/shared/utils';
import { Calendar, CalendarOptions as FullCalendarOptions, EventInput } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import timeGridPlugin from '@fullcalendar/timegrid';
import { computed, ref, Ref, toRefs, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import CalendarActions from './actions.vue';
import CalendarLayout from './calendar.vue';
import CalendarOptions from './options.vue';
import { useSync } from '@directus/shared/composables';
import { LayoutOptions } from './types';
import { syncRefProperty } from '@/utils/sync-ref-property';

export default defineLayout<LayoutOptions>({
	id: 'calendar',
	name: '$t:layouts.calendar.calendar',
	icon: 'event',
	component: CalendarLayout,
	slots: {
		options: CalendarOptions,
		sidebar: () => undefined,
		actions: CalendarActions,
	},
	setup(props, { emit }) {
		const { t, locale } = useI18n();

		const calendar = ref<Calendar>();

		const appStore = useAppStore();

		const layoutOptions = useSync(props, 'layoutOptions', emit);

		const { selection, collection, filter, search } = toRefs(props);

		const { primaryKeyField, fields: fieldsInCollection } = useCollection(collection);

		const dateFields = computed(() =>
			fieldsInCollection.value.filter((field: Field) => {
				return ['timestamp', 'dateTime', 'date'].includes(field.type);
			})
		);

		const calendarFilter = computed(() => {
			if (!calendar.value || !startDateField.value) {
				return;
			}
			const start = formatISO(calendar.value.view.activeStart);
			const end = formatISO(calendar.value.view.activeEnd);
			const startsHere = { [startDateField.value]: { _between: [start, end] } };
			if (!endDateField.value) {
				return startsHere;
			}
			const endsHere = { [endDateField.value]: { _between: [start, end] } };
			const startsBefore = { [startDateField.value]: { _lte: start } };
			const endsAfter = { [endDateField.value]: { _gte: end } };
			const overlapsHere = { _and: [startsBefore, endsAfter] };
			return { _or: [startsHere, endsHere, overlapsHere] };
		});

		const filterWithCalendarView = computed(() => {
			if (!calendarFilter.value) return filter.value;
			if (!filter.value) return null;

			return {
				_and: [filter.value, calendarFilter.value],
			};
		});

		const template = syncRefProperty(layoutOptions, 'template', undefined);
		const viewInfo = syncRefProperty(layoutOptions, 'viewInfo', undefined);

		const startDateField = syncRefProperty(layoutOptions, 'startDateField', undefined);
		const startDateFieldInfo = computed(() => {
			return fieldsInCollection.value.find((field: Field) => field.field === startDateField.value);
		});

		const endDateField = syncRefProperty(layoutOptions, 'endDateField', undefined);
		const endDateFieldInfo = computed(() => {
			return fieldsInCollection.value.find((field: Field) => field.field === endDateField.value);
		});

		const { items, loading, error, totalPages, itemCount, totalCount, changeManualSort, getItems } = useItems(
			collection,
			{
				sort: computed(() => [primaryKeyField.value?.field || '']),
				page: ref(1),
				limit: ref(-1),
				fields: computed(() => {
					if (!primaryKeyField.value) return [];

					const fields = [primaryKeyField.value.field];
					if (template.value) fields.push(...getFieldsFromTemplate(template.value));
					if (startDateField.value) fields.push(startDateField.value);
					if (endDateField.value) fields.push(endDateField.value);
					return fields;
				}),
				filter: filterWithCalendarView,
				search: search,
			},
			false
		);

		const events: Ref<EventInput> = computed(
			() => items.value.map((item: Item) => parseEvent(item)).filter((e: EventInput | null) => e) || []
		);

		const fullFullCalendarOptions = computed<FullCalendarOptions>(() => {
			const options: FullCalendarOptions = {
				editable: true,
				eventStartEditable: true,
				eventResizableFromStart: true,
				eventDurationEditable: true,
				dayMaxEventRows: true,
				height: '100%',
				nextDayThreshold: '01:00:00',
				plugins: [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin],
				initialView: viewInfo.value?.type ?? 'dayGridMonth',
				headerToolbar: {
					left: 'prevYear,prev,next,nextYear today',
					center: 'title',
					right: 'dayGridMonth,dayGridWeek,dayGridDay,listWeek',
				},
				events: events.value,
				initialDate: viewInfo.value?.startDateStr ?? formatISO(new Date()),
				eventClick(info) {
					if (!collection.value) return;

					if (props.selectMode || selection.value?.length > 0) {
						const item = items.value.find((item) => item[primaryKeyField.value!.field] == info.event.id);

						if (item) {
							if (selection.value.includes(item)) {
								selection.value = selection.value.filter((selectedItem) => selectedItem !== item);
							} else {
								selection.value = [...selection.value, item];
							}

							updateCalendar();
						}
					} else {
						const primaryKey = info.event.id;

						const endpoint = collection.value.startsWith('directus')
							? collection.value.substring(9)
							: `content/${collection.value}`;

						router.push(`/${endpoint}/${primaryKey}`);
					}
				},
				async eventChange(info) {
					if (!collection.value || !startDateField.value || !startDateFieldInfo.value) return;

					const itemChanges: Partial<Item> = {
						[startDateField.value]: adjustForType(info.event.startStr, startDateFieldInfo.value.type),
					};

					if (endDateField.value && endDateFieldInfo.value && info.event.endStr) {
						itemChanges[endDateField.value] = adjustForType(info.event.endStr, endDateFieldInfo.value.type);
					}

					const endpoint = collection.value.startsWith('directus')
						? collection.value.substring(9)
						: `/items/${collection.value}`;

					try {
						await api.patch(`${endpoint}/${info.event.id}`, itemChanges);
					} catch (err: any) {
						unexpectedError(err);
					}
				},
			};

			if (startDateFieldInfo.value?.type === 'dateTime' || startDateFieldInfo.value?.type === 'timestamp') {
				options.headerToolbar = {
					...options.headerToolbar,
					right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek',
				};
			}

			return options;
		});

		// Make sure to re-render the size of the calendar when the available space changes due to the
		// sidebar being manipulated
		watch(
			() => appStore.sidebarOpen,
			() => setTimeout(() => calendar.value?.updateSize(), 300)
		);

		watch(fullFullCalendarOptions, () => updateCalendar(), { deep: true, immediate: true });

		watch(
			[calendar, locale],
			async () => {
				if (calendar.value) {
					const calendarLocale = await getFullcalendarLocale(locale.value);
					calendar.value.setOption('locale', calendarLocale);
				}
			},
			{ immediate: true }
		);

		const showingCount = computed(() => {
			if (!itemCount.value) return null;

			return t('item_count', itemCount.value);
		});

		return {
			items,
			loading,
			error,
			totalPages,
			itemCount,
			totalCount,
			changeManualSort,
			getItems,
			filterWithCalendarView,
			template,
			dateFields,
			startDateField,
			endDateField,
			showingCount,
			createCalendar,
			destroyCalendar,
		};

		function updateCalendar() {
			if (calendar.value) {
				calendar.value.pauseRendering();
				calendar.value.resetOptions(fullFullCalendarOptions.value);
				calendar.value.resumeRendering();
				calendar.value.render();
			}
		}

		function createCalendar(calendarElement: HTMLElement) {
			calendar.value = new Calendar(calendarElement, fullFullCalendarOptions.value);

			calendar.value.on('datesSet', (args) => {
				viewInfo.value = {
					type: args.view.type,
					startDateStr: formatISO(args.view.currentStart),
				};
			});

			calendar.value.render();
		}

		function destroyCalendar() {
			calendar.value?.destroy();
		}

		function parseEvent(item: Item): EventInput | null {
			if (!startDateField.value || !primaryKeyField.value) return null;

			let endDate: string | undefined = undefined;

			// If the end date is a date-field (so no time), we can safely assume the item is meant to
			// last all day
			const allDay = endDateFieldInfo.value && endDateFieldInfo.value.type === 'date';

			if (endDateField.value) {
				if (allDay) {
					const date = parse(item[endDateField.value], 'yyyy-MM-dd', new Date());
					// FullCalendar uses exclusive end moments, so we'll have to increment the end date by 1 to get the
					// expected result in the calendar
					date.setDate(date.getDate() + 1);
					endDate = format(date, 'yyyy-MM-dd');
				} else {
					endDate = item[endDateField.value];
				}
			}

			return {
				id: item[primaryKeyField.value.field],
				title: renderPlainStringTemplate(template.value || `{{ ${primaryKeyField.value.field} }}`, item) || undefined,
				start: item[startDateField.value],
				end: endDate,
				allDay,
				className: selection.value.includes(item) ? 'selected' : undefined,
			};
		}

		function adjustForType(dateString: string, type: string) {
			if (type === 'dateTime') {
				return dateString.substring(0, 19);
			}
			return dateString;
		}
	},
});
