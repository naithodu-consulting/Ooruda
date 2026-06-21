'use client';

import { useCallback, useEffect, useState } from 'react';

import { Image as ImageIcon, Pencil, X } from 'lucide-react';
import { useForm } from 'react-hook-form';

import { Button } from '../shadcn/button';
import { ImageUploadInput } from './image-upload-input';
import { Trans } from './trans';

export function ImageUploader(
  props: React.PropsWithChildren<{
    value: string | null | undefined;
    onValueChange: (value: File | null) => unknown;
  }>,
) {
  const [image, setImage] = useState(props.value);

  const { setValue, register } = useForm<{
    value: string | null | FileList;
  }>({
    defaultValues: {
      value: props.value,
    },
    mode: 'onChange',
    reValidateMode: 'onChange',
  });

  const control = register('value');

  // Optimistically reflect the change, but if the parent's save rejects (e.g. a
  // network or permission error), roll the preview back to the last known value
  // instead of leaving a stale image on screen until a manual refresh. Parents
  // that don't return a promise resolve to undefined here, so they keep their
  // existing fire-and-forget behaviour with no revert.
  const onClear = useCallback(() => {
    const previous = props.value;

    setValue('value', null);
    setImage('');

    void Promise.resolve(props.onValueChange(null)).catch(() => {
      setValue('value', previous ?? null);
      setImage(previous);
    });
  }, [props, setValue]);

  const onValueChange = useCallback(
    ({ image, file }: { image: string; file: File }) => {
      const previous = props.value;

      setImage(image);

      void Promise.resolve(props.onValueChange(file)).catch(() => {
        setImage(previous);
      });
    },
    [props],
  );

  // Resync from the prop only when it actually changes (e.g. the parent
  // revalidates after a successful upload/clear) — not on every render. The
  // old code compared props.value !== image during render and called
  // setImage unconditionally, which stomped the local optimistic update
  // (clearing/uploading) back to the stale prop on the very next render,
  // before the parent ever had a chance to revalidate.
  useEffect(() => {
    setImage(props.value);
  }, [props.value]);

  if (!image) {
    return (
      <FallbackImage descriptionSection={props.children}>
        <ImageUploadInput
          {...control}
          accept={'image/*'}
          className={'absolute h-full w-full'}
          visible={false}
          multiple={false}
          onValueChange={onValueChange}
        />
      </FallbackImage>
    );
  }

  return (
    <div className={'flex items-center space-x-4'}>
      <label
        className={
          'border-border animate-in fade-in zoom-in-50 group/label relative h-20 w-20 cursor-pointer overflow-hidden rounded-full border'
        }
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          decoding="async"
          className={
            'h-full w-full object-cover transition-all duration-300 group-hover/label:opacity-50'
          }
          src={image}
          alt={''}
        />

        <div
          className={
            'absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover/label:opacity-100'
          }
        >
          <Pencil className={'text-foreground h-5 w-5'} />
        </div>

        <ImageUploadInput
          {...control}
          accept={'image/*'}
          className={'absolute h-full w-full'}
          visible={false}
          multiple={false}
          onValueChange={onValueChange}
        />
      </label>

      <div>
        <Button onClick={onClear} size={'sm'} variant={'outline'}>
          <X className={'mr-1 h-4 w-4'} />
          <Trans i18nKey={'common.clear'} />
        </Button>
      </div>
    </div>
  );
}

function FallbackImage(
  props: React.PropsWithChildren<{
    descriptionSection?: React.ReactNode;
  }>,
) {
  return (
    <div className={'flex items-center space-x-4'}>
      <label
        className={
          'border-border animate-in fade-in zoom-in-50 hover:border-primary relative flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-full border'
        }
      >
        <ImageIcon className={'text-primary h-8'} />

        {props.children}
      </label>

      {props.descriptionSection}
    </div>
  );
}
