# Основания модели

## Используем сейчас
- [Baldan et al., 2015](https://air.iuav.it/handle/11578/264484): разделение впуск/блок/выпуск, процедурный синтез. Основа структуры.
- [Julius O. Smith — Digital Waveguide Models](https://dsprelated.com/freebooks/pasp/Digital_Waveguide_Models.html): задержки, отражения, сопротивление rho*c/A. Основа дальнейшего физического уточнения трактов.
- [UNSW — Helmholtz resonance](https://newt.phys.unsw.edu.au/jw/Helmholtz.html): f=c/(2*pi)*sqrt(A/(V*Leff)). Приближение камеры впуска.
- [Коллекторы, 2019](https://www.sciencedirect.com/science/article/pii/S0003682X17309155): важны пути цилиндров и распределение порядков. Изучена доступная аннотация.
- [COMSOL Absorptive Muffler](https://doc.comsol.com/6.3/doc/com.comsol.help.models.aco.absorptive_muffler/absorptive_muffler.html): частотные потери, пределы одномерного приближения.
- [Ford — Flow Excited Noise](https://saemobilus.sae.org/papers/flow-excited-noise-analysis-exhaust-2005-01-2352): отдельный шум потока. Аннотация; не переносим количественные выводы на любой двигатель.
- [DasEtwas/enginesound](https://github.com/DasEtwas/enginesound): изучен gen.rs как пример компактного ядра; код проекта написан отдельно, без копирования.
- [AudioWorklet patterns](https://developer.chrome.com/blog/audio-worklet-design-pattern/): аудиопоток, ограничения времени/аллокаций.

## Следующее уточнение
- [Davies/Harrison — Hybrid Systems](https://www.ioa.org.uk/system/files/publications/POAL%20DAVIES%20MF%20HARRISON%20HYBRID%20SYSTEMS%20FOR%20I.C.%20ENGINE%20BREATHING%20NOISE%20SYNTHESIS.pdf): источники и передаточные свойства, температура/расход, обратная связь.
- [Combustion noise, 2016](https://link.springer.com/article/10.1007/s41104-016-0001-5): давление и его производные, структурный путь, впрыск зависит от режима.
- [Turbocharger acoustics](https://saemobilus.sae.org/papers/acoustics-turbochargers-2007-01-2205): активный источник плюс пассивная фильтрация. Аннотация.
- [PTR, 2026, препринт](https://arxiv.org/html/2603.09391v1): импульсы/резонаторы и подгонка по записи. Нейросеть для нашей первой версии не требуется.
- [Order analysis](https://www.bksv.com/de/knowledge/blog/sound/order-analysis-bkc-2250): сравнение порядков и стационарных резонансов при калибровке.

## Классификация
Передачи/масса/колёса → динамика → RPM и нагрузка.
Углы событий/цилиндры → ритм источника.
Трубы/глушитель/камера впуска → акустическая фильтрация.
Клапаны/впрыск/наддув → смешанное влияние; нужны отдельные подмодели.
Объём цилиндра → масштаб источника и динамика, не произвольное понижение высоты тона.

## Приёмка причинных связей
Смена длины при неизменном источнике должна менять отклик тракта; смена нагрузки при фиксированном RPM — энергию/спектр источника.
Смена передачи при одинаковом состоянии не должна менять DSP. Углы событий проверяются за полный цикл.
Спектральные тесты подтверждают поведение алгоритма, но не совпадение с реальным двигателем.
