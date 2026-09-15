/* global jest, test, expect */
import React from 'react';
import renderer from 'react-test-renderer';
import {Text} from 'react-native';
import App from '../App';

jest.mock('react-native-safe-area-context', () => {
  const {View} = require('react-native');
  return {
    SafeAreaProvider: ({children}) => <View>{children}</View>,
    SafeAreaView: ({children, style}) => <View style={style}>{children}</View>,
  };
});

test('the initial mobile shell only presents Mi jornada', () => {
  let tree;
  renderer.act(() => {
    tree = renderer.create(<App />);
  });
  const labels = tree.root.findAllByType(Text).map(node => node.props.children);
  expect(labels).toContain('Mi jornada');
  expect(labels).not.toContain('Solicitudes');
});
